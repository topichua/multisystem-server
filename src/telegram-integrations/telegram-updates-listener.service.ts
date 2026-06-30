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
import { NewMessage } from "telegram/events";
import type { TelegramClient } from "telegram";
import { IsNull, Not, Repository } from "typeorm";
import {
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

const SYNC_INTERVAL_MS = 60_000;
/** Backoff before retrying attach after AUTH_KEY_DUPLICATED (session stays valid). */
const SESSION_BUSY_RETRY_MS = 90_000;

type ActiveClient = {
  client: TelegramClient;
  integration: TelegramIntegration;
  sessionKey: string;
};

@Injectable()
export class TelegramUpdatesListenerService
  implements
    OnApplicationBootstrap,
    BeforeApplicationShutdown,
    OnModuleDestroy
{
  private readonly log = new Logger(TelegramUpdatesListenerService.name);
  private readonly clients = new Map<number, ActiveClient>();
  /** integration_id → timestamp of last AUTH_KEY_DUPLICATED. */
  private readonly sessionBusySince = new Map<number, number>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private startupPromise: Promise<void> | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    private readonly telegramApi: TelegramUserApiService,
    @Inject(forwardRef(() => TelegramMessagePersistenceService))
    private readonly persistence: TelegramMessagePersistenceService,
  ) {}

  isEnabled(): boolean {
    const flag = this.config.get<string>("TELEGRAM_LISTENER_ENABLED")?.trim();
    return flag !== "false" && flag !== "0";
  }

  async onApplicationBootstrap(): Promise<void> {
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
      await this.detachIntegration(id);
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

  /**
   * Keeps in-memory listeners aligned with `telegram_integrations`:
   * detach removed/deactivated, attach new, reload changed sessions, reconnect dead clients.
   */
  private async reconcileIntegrations(options?: {
    logSummary?: boolean;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const rows = await this.fetchActiveIntegrations();
      const activeIds = new Set(rows.map((row) => row.id));

      if (options?.logSummary) {
        this.log.log(`Starting Telegram listeners for ${rows.length} integration(s)`);
      }

      for (const id of [...this.clients.keys()]) {
        if (!activeIds.has(id)) {
          this.log.log(
            `Telegram listener detaching integration_id=${id}: removed or no longer active`,
          );
          await this.detachIntegration(id);
        }
      }

      const attachedSessions = this.collectAttachedSessionKeys();

      let attached = 0;
      let skipped = 0;
      let failed = 0;
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
            const result = await this.attachIntegrationWithRetry(row);
            if (result === "attached") {
              attachedSessions.add(session);
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
            const result = await this.attachIntegrationWithRetry(row);
            if (result === "attached") {
              attachedSessions.add(session);
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

        if (this.isSessionBusyBlocked(row.id)) {
          skipped += 1;
          this.log.warn(
            `Telegram listener skipped integration_id=${row.id}: AUTH_KEY_DUPLICATED retry cooldown`,
          );
          continue;
        }

        if (!options?.logSummary) {
          this.log.log(
            `Telegram listener attaching integration_id=${row.id}: new active integration`,
          );
        }

        const result = await this.attachIntegrationWithRetry(row);
        if (result === "attached") {
          attached += 1;
          attachedSessions.add(session);
        } else if (result === "skipped") {
          skipped += 1;
        } else {
          failed += 1;
        }
      }

      if (options?.logSummary) {
        this.log.log(
          `Telegram listener startup complete: running=${this.clients.size} attached=${attached} reloaded=${reloaded} skipped=${skipped} failed=${failed}`,
        );
      } else if (attached > 0 || reloaded > 0 || this.clients.size !== rows.length) {
        const runningIds = [...this.clients.keys()].join(",") || "none";
        this.log.log(
          `Telegram listener sync: running=${this.clients.size} [ids=${runningIds}] db_active=${rows.length} attached=${attached} reloaded=${reloaded} skipped=${skipped} failed=${failed}`,
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

  private isSessionBusyBlocked(integrationId: number): boolean {
    const since = this.sessionBusySince.get(integrationId);
    if (since == null) {
      return false;
    }
    if (Date.now() - since >= SESSION_BUSY_RETRY_MS) {
      this.sessionBusySince.delete(integrationId);
      return false;
    }
    return true;
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
          "Only one can listen at a time — later ids may get AUTH_KEY_DUPLICATED from the first attached in this process.",
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
    await this.attachIntegrationWithRetry(integration);
  }

  /**
   * Stops every in-memory GramJS listener (destroy clients, clear map).
   * Does not update `telegram_integrations` rows — use disconnect API for that.
   */
  async killAllListeners(): Promise<number> {
    const ids = [...this.clients.keys()];
    for (const id of ids) {
      await this.detachIntegration(id);
    }
    if (ids.length > 0) {
      this.log.log(`Telegram listener killed all clients (count=${ids.length})`);
    }
    return ids.length;
  }

  private async attachIntegrationWithRetry(
    integration: TelegramIntegration,
  ): Promise<"attached" | "skipped" | "failed"> {
    const result = await this.attachIntegrationOnce(integration);
    if (result === "auth_key_duplicated") {
      return "skipped";
    }
    return result;
  }

  private async attachIntegrationOnce(
    integration: TelegramIntegration,
  ): Promise<"attached" | "skipped" | "failed" | "auth_key_duplicated"> {
    if (!this.isEnabled()) {
      return "skipped";
    }

    const session = integration.sessionString?.trim();
    if (!session || integration.status !== TelegramIntegrationStatus.ACTIVE) {
      return "skipped";
    }

    await this.detachIntegration(integration.id);

    const client = this.telegramApi.createListenerClient(session);
    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        this.log.warn(
          `Telegram integration id=${integration.id} session not authorized; skip listener`,
        );
        await this.telegramApi.destroyClient(client);
        return "skipped";
      }

      const handler = async (event: unknown) => {
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

      this.clients.set(integration.id, { client, integration, sessionKey: session });
      await this.clearTransientAttachError(integration.id);
      this.log.log(
        `Telegram listener attached integration_id=${integration.id} phone=${integration.phoneNumber}`,
      );
      return "attached";
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (this.isAuthKeyDuplicated(e)) {
        const session = integration.sessionString?.trim() ?? "";
        const localHolderId = this.findLocalSessionHolder(session);
        await this.handleAuthKeyDuplicated(integration, {
          client,
          hint:
            localHolderId != null
              ? `same session already attached locally as integration_id=${localHolderId}`
              : "session auth key is active in another process (old deploy, second Railway service, or Telegram still closing previous connection)",
          localHolderId,
        });
        return "auth_key_duplicated";
      }

      this.log.error(
        `Failed to attach Telegram listener id=${integration.id}: ${err}`,
      );
      await this.telegramApi.destroyClient(client);
      return "failed";
    }
  }

  /**
   * AUTH_KEY_DUPLICATED recovery: tear down client and retry later.
   * Session in DB stays valid — no client re-login required.
   */
  private async handleAuthKeyDuplicated(
    integration: TelegramIntegration,
    options: {
      client?: TelegramClient | null;
      hint: string;
      localHolderId?: number;
    },
  ): Promise<void> {
    const { client, hint, localHolderId } = options;

    if (localHolderId != null) {
      this.log.warn(
        `Telegram listener skipped integration_id=${integration.id}: AUTH_KEY_DUPLICATED (${hint})`,
      );
      if (client) {
        await this.telegramApi.destroyClient(client);
      }
      return;
    }

    this.log.error(
      `Telegram AUTH_KEY_DUPLICATED integration_id=${integration.id}: ${hint}`,
    );

    this.sessionBusySince.set(integration.id, Date.now());

    const active = this.clients.get(integration.id);
    const toDestroy = client ?? active?.client ?? null;

    this.clients.delete(integration.id);

    if (toDestroy) {
      await this.telegramApi.destroyClient(toDestroy);
    }

    this.log.log(
      `Telegram integration_id=${integration.id} will retry attach automatically (session unchanged, no re-login needed)`,
    );
  }

  private async clearTransientAttachError(integrationId: number): Promise<void> {
    try {
      const row = await this.telegramRepo.findOne({
        where: { id: integrationId },
        select: { id: true, lastError: true },
      });
      if (row?.lastError?.includes("AUTH_KEY_DUPLICATED")) {
        await this.telegramRepo.update({ id: integrationId }, { lastError: null });
      }
    } catch {
      /* ignore */
    }
  }

  private findLocalSessionHolder(session: string): number | undefined {
    if (!session) {
      return undefined;
    }
    for (const [id, active] of this.clients) {
      if (active.sessionKey === session) {
        return id;
      }
    }
    return undefined;
  }

  private isAuthKeyDuplicated(err: unknown): boolean {
    return this.telegramErrorMessage(err).includes("AUTH_KEY_DUPLICATED");
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

  async detachIntegration(integrationId: number): Promise<void> {
    const active = this.clients.get(integrationId);
    this.sessionBusySince.delete(integrationId);
    if (!active) {
      return;
    }
    this.clients.delete(integrationId);
    await this.telegramApi.destroyClient(active.client);
    this.log.log(`Telegram listener detached integration_id=${integrationId}`);
  }

  getActiveClient(integrationId: number): TelegramClient | undefined {
    return this.clients.get(integrationId)?.client;
  }

  async reloadIntegration(integrationId: number): Promise<void> {
    const row = await this.telegramRepo.findOne({ where: { id: integrationId } });
    if (!row) {
      await this.detachIntegration(integrationId);
      return;
    }
    if (
      row.status === TelegramIntegrationStatus.ACTIVE &&
      row.sessionString?.trim()
    ) {
      await this.attachIntegration(row);
    } else {
      await this.detachIntegration(integrationId);
    }
  }
}
