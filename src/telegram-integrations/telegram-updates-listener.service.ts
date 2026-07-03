import {
  BeforeApplicationShutdown,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { hostname } from "os";
import { NewMessage } from "telegram/events";
import type { TelegramClient } from "telegram";
import { IsNull, Not, Repository } from "typeorm";
import {
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import { TelegramIntegrationLockService } from "./telegram-integration-lock.service";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

const SYNC_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 18_000;
const AUTH_KEY_DUPLICATED_ERROR = "AUTH_KEY_DUPLICATED";

type ActiveClient = {
  client: TelegramClient;
  integration: TelegramIntegration;
  sessionKey: string;
  lockVersion: number;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
};

type AttachResult =
  | "attached"
  | "skipped"
  | "failed"
  | "lock_not_acquired"
  | "auth_key_duplicated";

@Injectable()
export class TelegramUpdatesListenerService
  implements
    OnApplicationBootstrap,
    BeforeApplicationShutdown,
    OnModuleDestroy
{
  private readonly log = new Logger(TelegramUpdatesListenerService.name);
  readonly instanceId = `${hostname()}-${process.pid}-${randomUUID()}`;
  private readonly clients = new Map<number, ActiveClient>();
  private readonly attachInFlight = new Map<number, Promise<AttachResult>>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private reconcileInFlight: Promise<void> | null = null;
  private startupPromise: Promise<void> | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    private readonly telegramApi: TelegramUserApiService,
    private readonly lockService: TelegramIntegrationLockService,
    @Inject(forwardRef(() => TelegramMessagePersistenceService))
    private readonly persistence: TelegramMessagePersistenceService,
  ) {}

  isEnabled(): boolean {
    const flag = this.config.get<string>("TELEGRAM_LISTENER_ENABLED")?.trim();
    return flag !== "false" && flag !== "0";
  }

  async onApplicationBootstrap(): Promise<void> {
    this.log.log(`Telegram listener instance_id=${this.instanceId}`);
    this.startupPromise = this.bootstrapListeners();
    await this.startupPromise;
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.shutdownListeners("shutdown signal");
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdownListeners("module destroy");
  }

  private async shutdownListeners(reason: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    if (this.syncTimer != null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    const count = this.clients.size;
    if (count > 0) {
      this.log.log(
        `Telegram listener shutting down (${reason}); releasing ${count} session(s)`,
      );
    }

    const ids = [...this.clients.keys()];
    for (const id of ids) {
      await this.detachIntegration(id, { releaseLock: true });
    }
  }

  private async bootstrapListeners(): Promise<void> {
    if (!this.isEnabled()) {
      this.log.log(
        "Telegram message listener disabled (TELEGRAM_LISTENER_ENABLED=false)",
      );
      return;
    }

    try {
      this.telegramApi.getCredentials();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram listener not started: ${err}`);
      return;
    }

    const rows = await this.fetchActiveIntegrations();

    if (rows.length === 0) {
      const disconnectedWithSession = await this.telegramRepo.count({
        where: {
          status: TelegramIntegrationStatus.DISCONNECTED,
          sessionString: Not(IsNull()),
        },
      });
      if (disconnectedWithSession > 0) {
        this.log.warn(
          `No active Telegram integrations to listen on; ${disconnectedWithSession} disconnected row(s) still have a session in DB`,
        );
      } else {
        this.log.log(
          "No active Telegram integrations with session_string; listener idle",
        );
      }
    }

    await this.logActiveIntegrationsDiagnostics(rows);
    await this.reconcileIntegrations({ logSummary: true });

    this.syncTimer = setInterval(() => {
      void this.reconcileIntegrations();
    }, SYNC_INTERVAL_MS);
  }

  private async fetchActiveIntegrations(): Promise<TelegramIntegration[]> {
    return this.telegramRepo.find({
      where: {
        status: TelegramIntegrationStatus.ACTIVE,
        sessionString: Not(IsNull()),
      },
      order: { id: "ASC" },
    });
  }

  private async reconcileIntegrations(options?: {
    logSummary?: boolean;
  }): Promise<void> {
    if (!this.isEnabled() || this.isShuttingDown) {
      return;
    }

    if (this.reconcileInFlight) {
      await this.reconcileInFlight;
      return;
    }

    this.reconcileInFlight = this.reconcileIntegrationsOnce(options);
    try {
      await this.reconcileInFlight;
    } finally {
      this.reconcileInFlight = null;
    }
  }

  private async reconcileIntegrationsOnce(options?: {
    logSummary?: boolean;
  }): Promise<void> {
    try {
      const rows = await this.fetchActiveIntegrations();
      const activeIds = new Set(rows.map((row) => row.id));

      if (options?.logSummary) {
        this.log.log(
          `Starting Telegram listeners for ${rows.length} integration(s)`,
        );
      }

      for (const id of [...this.clients.keys()]) {
        if (!activeIds.has(id)) {
          this.log.log(
            `Telegram listener detaching integration_id=${id}: removed or no longer active`,
          );
          await this.detachIntegration(id, { releaseLock: true });
        }
      }

      const attachedSessions = this.collectAttachedSessionKeys();

      let attached = 0;
      let skipped = 0;
      let failed = 0;
      let lockFailed = 0;
      let reloaded = 0;

      for (const row of rows) {
        const session = row.sessionString?.trim();
        if (!session) {
          continue;
        }

        const existing = this.clients.get(row.id);
        if (existing) {
          if (existing.sessionKey !== session) {
            reloaded += 1;
            this.log.log(
              `Telegram listener reloading integration_id=${row.id}: session changed`,
            );
            const result = await this.attachIntegrationWithLock(row);
            if (result === "attached") {
              attachedSessions.add(session);
            } else if (result === "lock_not_acquired") {
              lockFailed += 1;
            } else if (result === "skipped") {
              skipped += 1;
            } else {
              failed += 1;
            }
            continue;
          }

          if (!this.isClientConnected(existing.client)) {
            reloaded += 1;
            this.log.warn(
              `Telegram listener reconnecting integration_id=${row.id}: client disconnected`,
            );
            const result = await this.attachIntegrationWithLock(row);
            if (result === "attached") {
              attachedSessions.add(session);
            } else if (result === "lock_not_acquired") {
              lockFailed += 1;
            } else if (result === "skipped") {
              skipped += 1;
            } else {
              failed += 1;
            }
          }
          continue;
        }

        if (attachedSessions.has(session)) {
          skipped += 1;
          this.log.warn(
            `Telegram listener skipped integration_id=${row.id}: same session already attached by another integration in this process`,
          );
          continue;
        }

        if (!options?.logSummary) {
          this.log.log(
            `Telegram listener attaching integration_id=${row.id}: new active integration`,
          );
        }

        const result = await this.attachIntegrationWithLock(row);
        if (result === "attached") {
          attached += 1;
          attachedSessions.add(session);
        } else if (result === "lock_not_acquired") {
          lockFailed += 1;
        } else if (result === "skipped") {
          skipped += 1;
        } else {
          failed += 1;
        }
      }

      if (options?.logSummary) {
        this.log.log(
          `Telegram listener startup complete: instance=${this.instanceId} running=${this.clients.size} attached=${attached} reloaded=${reloaded} skipped=${skipped} lock_failed=${lockFailed} failed=${failed}`,
        );
      } else if (
        attached > 0 ||
        reloaded > 0 ||
        lockFailed > 0 ||
        this.clients.size !== rows.length
      ) {
        const runningIds = [...this.clients.keys()].join(",") || "none";
        this.log.log(
          `Telegram listener sync: instance=${this.instanceId} running=${this.clients.size} [ids=${runningIds}] db_active=${rows.length} attached=${attached} reloaded=${reloaded} skipped=${skipped} lock_failed=${lockFailed} failed=${failed}`,
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram listener sync failed: ${err}`);
    }
  }

  private collectAttachedSessionKeys(): Set<string> {
    const attachedSessions = new Set<string>();
    for (const active of this.clients.values()) {
      attachedSessions.add(active.sessionKey);
    }
    return attachedSessions;
  }

  private isClientConnected(client: TelegramClient): boolean {
    return client.connected === true;
  }

  private async logActiveIntegrationsDiagnostics(
    rows: TelegramIntegration[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    for (const row of rows) {
      this.log.log(
        `Telegram integration candidate id=${row.id} phone=${row.phoneNumber ?? "n/a"} ` +
          `telegram_user_id=${row.telegramUserId ?? "n/a"} session=${this.describeSession(row.sessionString)}`,
      );
    }

    const bySession = new Map<string, TelegramIntegration[]>();
    for (const row of rows) {
      const session = row.sessionString?.trim();
      if (!session) {
        continue;
      }
      const list = bySession.get(session) ?? [];
      list.push(row);
      bySession.set(session, list);
    }

    for (const [session, integrations] of bySession) {
      if (integrations.length < 2) {
        continue;
      }
      const ids = integrations.map((i) => i.id).join(", ");
      this.log.warn(
        `Telegram integrations [${ids}] share the same session (${this.describeSession(session)}). ` +
          "Only one integration can hold the listener lock at a time.",
      );
    }
  }

  private describeSession(session: string | null | undefined): string {
    const trimmed = session?.trim();
    if (!trimmed) {
      return "empty";
    }
    return `len=${trimmed.length} prefix=${trimmed.slice(0, 12)}...`;
  }

  async attachIntegration(integration: TelegramIntegration): Promise<void> {
    await this.attachIntegrationWithLock(integration);
  }

  async killAllListeners(): Promise<number> {
    const ids = [...this.clients.keys()];
    for (const id of ids) {
      await this.detachIntegration(id, { releaseLock: true });
    }
    if (ids.length > 0) {
      this.log.log(
        `Telegram listener killed all clients (count=${ids.length}) instance=${this.instanceId}`,
      );
    }
    return ids.length;
  }

  private attachIntegrationWithLock(
    integration: TelegramIntegration,
  ): Promise<AttachResult> {
    const inFlight = this.attachInFlight.get(integration.id);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.attachIntegrationOnce(integration).finally(() => {
      if (this.attachInFlight.get(integration.id) === promise) {
        this.attachInFlight.delete(integration.id);
      }
    });
    this.attachInFlight.set(integration.id, promise);
    return promise;
  }

  private async attachIntegrationOnce(
    integration: TelegramIntegration,
  ): Promise<AttachResult> {
    if (!this.isEnabled() || this.isShuttingDown) {
      return "skipped";
    }

    const session = integration.sessionString?.trim();
    if (!session || integration.status !== TelegramIntegrationStatus.ACTIVE) {
      return "skipped";
    }

    const existing = this.clients.get(integration.id);
    if (
      existing &&
      existing.sessionKey === session &&
      this.isClientConnected(existing.client)
    ) {
      return "attached";
    }

    const isReconnect = existing != null;
    await this.detachIntegration(integration.id, { releaseLock: true });

    await this.patchIntegration(integration.id, {
      status: TelegramIntegrationStatus.CONNECTING,
      listenerInstanceId: this.instanceId,
      lastError: null,
    });

    const lock = await this.lockService.acquire(integration.id, this.instanceId);
    if (!lock.acquired) {
      await this.patchIntegration(integration.id, {
        status: TelegramIntegrationStatus.ACTIVE,
        listenerInstanceId: lock.ownerInstanceId ?? null,
        listenerHeartbeatAt: null,
      });
      return "lock_not_acquired";
    }

    const client = this.telegramApi.createListenerClient(session);
    let lockVersion = lock.lockVersion;

    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        this.log.warn(
          `Telegram integration id=${integration.id} session not authorized; skip listener`,
        );
        await this.telegramApi.destroyClient(client);
        await this.lockService.release(
          integration.id,
          this.instanceId,
          lockVersion,
        );
        await this.patchIntegration(integration.id, {
          status: TelegramIntegrationStatus.ACTIVE,
          listenerInstanceId: null,
          listenerHeartbeatAt: null,
        });
        return "skipped";
      }

      const handler = async (event: unknown) => {
        const active = this.clients.get(integration.id);
        if (!active) {
          return;
        }

        const fenceOk = await this.lockService.verifyFence(
          integration.id,
          this.instanceId,
          active.lockVersion,
        );
        if (!fenceOk) {
          this.log.warn(
            `Telegram listener stale update ignored integration_id=${integration.id}: lost lock (fencing)`,
          );
          void this.stopListenerDueToLostLock(integration.id);
          return;
        }

        try {
          await this.persistence.persistNewMessageEvent(
            integration,
            event as import("telegram/events").NewMessageEvent,
            client,
          );
        } catch (e) {
          if (this.isAuthKeyDuplicated(e)) {
            void this.handleAuthKeyDuplicated(integration, {
              client,
              hint: "session auth key duplicated during update polling",
            });
            return;
          }
          const err = e instanceof Error ? e.message : String(e);
          this.log.warn(
            `Telegram message handler failed integration_id=${integration.id}: ${err}`,
          );
        }
      };

      client.addEventHandler(handler, new NewMessage({}));

      try {
        await client.getDialogs({ limit: 100 });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.debug(
          `Telegram dialog preload failed integration_id=${integration.id}: ${err}`,
        );
      }

      const heartbeatTimer = setInterval(() => {
        void this.runHeartbeat(integration.id, lockVersion);
      }, HEARTBEAT_INTERVAL_MS);

      this.clients.set(integration.id, {
        client,
        integration,
        sessionKey: session,
        lockVersion,
        heartbeatTimer,
      });

      const now = new Date();
      await this.patchIntegration(integration.id, {
        status: TelegramIntegrationStatus.ACTIVE,
        listenerInstanceId: this.instanceId,
        listenerHeartbeatAt: now,
        lastError: null,
      });

      this.log.log(
        isReconnect
          ? `Telegram listener reconnected integration_id=${integration.id} phone=${integration.phoneNumber} lock_version=${lockVersion}`
          : `Telegram listener attached integration_id=${integration.id} phone=${integration.phoneNumber} lock_version=${lockVersion}`,
      );
      void this.runCatchUp(integration, client);
      return "attached";
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (this.isAuthKeyDuplicated(e)) {
        await this.handleAuthKeyDuplicated(integration, {
          client,
          hint:
            "session auth key is active in another process or stale listener",
          lockVersion,
        });
        return "auth_key_duplicated";
      }

      this.log.error(
        `Failed to attach Telegram listener id=${integration.id}: ${err}`,
      );
      await this.telegramApi.destroyClient(client);
      await this.lockService.release(
        integration.id,
        this.instanceId,
        lockVersion,
      );
      await this.patchIntegration(integration.id, {
        status: TelegramIntegrationStatus.ACTIVE,
        listenerInstanceId: null,
        listenerHeartbeatAt: null,
      });
      return "failed";
    }
  }

  private async runHeartbeat(
    integrationId: number,
    lockVersion: number,
  ): Promise<void> {
    const active = this.clients.get(integrationId);
    if (!active || active.lockVersion !== lockVersion) {
      return;
    }

    const ok = await this.lockService.heartbeat(
      integrationId,
      this.instanceId,
      lockVersion,
    );
    if (!ok) {
      this.log.warn(
        `Telegram listener stopped integration_id=${integrationId}: heartbeat failed (lost lock)`,
      );
      await this.stopListenerDueToLostLock(integrationId);
      return;
    }

    await this.patchIntegration(integrationId, {
      listenerInstanceId: this.instanceId,
      listenerHeartbeatAt: new Date(),
    });
  }

  private async stopListenerDueToLostLock(integrationId: number): Promise<void> {
    const active = this.clients.get(integrationId);
    if (!active) {
      return;
    }

    this.clearHeartbeatTimer(active);
    this.clients.delete(integrationId);
    await this.telegramApi.destroyClient(active.client);

    await this.patchIntegration(integrationId, {
      listenerInstanceId: null,
      listenerHeartbeatAt: null,
    });

    this.log.warn(
      `Telegram listener stopped due to lost lock integration_id=${integrationId} instance=${this.instanceId}`,
    );
  }

  private async runCatchUp(
    integration: TelegramIntegration,
    client: TelegramClient,
  ): Promise<void> {
    const active = this.clients.get(integration.id);
    if (!active) {
      return;
    }

    const fenceOk = await this.lockService.verifyFence(
      integration.id,
      this.instanceId,
      active.lockVersion,
    );
    if (!fenceOk) {
      return;
    }

    try {
      const saved = await this.persistence.catchUpRecentPrivateMessages(
        integration,
        client,
      );
      if (saved > 0) {
        this.log.log(
          `Telegram catch-up saved ${saved} message(s) integration_id=${integration.id}`,
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Telegram catch-up failed integration_id=${integration.id}: ${err}`,
      );
    }
  }

  private async handleAuthKeyDuplicated(
    integration: TelegramIntegration,
    options: {
      client?: TelegramClient | null;
      hint: string;
      lockVersion?: number;
    },
  ): Promise<void> {
    const { client, hint, lockVersion } = options;

    this.log.error(
      `Telegram AUTH_KEY_DUPLICATED integration_id=${integration.id}: ${hint}`,
    );

    const active = this.clients.get(integration.id);
    const toDestroy = client ?? active?.client ?? null;
    const version = lockVersion ?? active?.lockVersion;

    if (active) {
      this.clearHeartbeatTimer(active);
      this.clients.delete(integration.id);
    }

    if (toDestroy) {
      await this.telegramApi.destroyClient(toDestroy);
    }

    if (version != null) {
      await this.lockService.release(
        integration.id,
        this.instanceId,
        version,
      );
    }

    await this.patchIntegration(integration.id, {
      status: TelegramIntegrationStatus.ERROR,
      lastError: AUTH_KEY_DUPLICATED_ERROR,
      listenerInstanceId: null,
      listenerHeartbeatAt: null,
    });

    this.log.warn(
      `Telegram integration_id=${integration.id} set to error; re-login required (no auto-retry)`,
    );
  }

  private clearHeartbeatTimer(active: ActiveClient): void {
    if (active.heartbeatTimer != null) {
      clearInterval(active.heartbeatTimer);
      active.heartbeatTimer = null;
    }
  }

  private async patchIntegration(
    integrationId: number,
    patch: Partial<
      Pick<
        TelegramIntegration,
        | "status"
        | "listenerInstanceId"
        | "listenerHeartbeatAt"
        | "lastError"
      >
    >,
  ): Promise<void> {
    try {
      await this.telegramRepo.update({ id: integrationId }, patch);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Failed to update integration listener state id=${integrationId}: ${err}`,
      );
    }
  }

  private isAuthKeyDuplicated(err: unknown): boolean {
    return this.telegramErrorMessage(err).includes(AUTH_KEY_DUPLICATED_ERROR);
  }

  private telegramErrorMessage(err: unknown): string {
    if (err && typeof err === "object" && "errorMessage" in err) {
      const m = (err as { errorMessage?: unknown }).errorMessage;
      if (typeof m === "string") {
        return m;
      }
    }
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }

  async detachIntegration(
    integrationId: number,
    options?: { releaseLock?: boolean },
  ): Promise<void> {
    const active = this.clients.get(integrationId);
    if (!active) {
      return;
    }

    this.clearHeartbeatTimer(active);
    this.clients.delete(integrationId);
    await this.telegramApi.destroyClient(active.client);

    if (options?.releaseLock) {
      await this.lockService.release(
        integrationId,
        this.instanceId,
        active.lockVersion,
      );
      await this.patchIntegration(integrationId, {
        listenerInstanceId: null,
        listenerHeartbeatAt: null,
      });
    }

    this.log.log(
      `Telegram listener detached integration_id=${integrationId} instance=${this.instanceId}`,
    );
  }

  getActiveClient(integrationId: number): TelegramClient | undefined {
    return this.clients.get(integrationId)?.client;
  }

  async reloadIntegration(integrationId: number): Promise<void> {
    const row = await this.telegramRepo.findOne({ where: { id: integrationId } });
    if (!row) {
      await this.detachIntegration(integrationId, { releaseLock: true });
      return;
    }
    if (
      row.status === TelegramIntegrationStatus.ACTIVE &&
      row.sessionString?.trim()
    ) {
      await this.attachIntegration(row);
    } else {
      await this.detachIntegration(integrationId, { releaseLock: true });
    }
  }
}
