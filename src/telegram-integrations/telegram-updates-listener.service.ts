import {
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
import { DataSource, IsNull, Not, QueryRunner, Repository } from "typeorm";
import {
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

/** PostgreSQL advisory lock id — only one deploy replica should run GramJS listeners. */
const TELEGRAM_LISTENER_ADVISORY_LOCK_KEY = 1_744_200_093;
const SYNC_INTERVAL_MS = 60_000;

type ActiveClient = {
  client: TelegramClient;
  integration: TelegramIntegration;
  sessionKey: string;
};

@Injectable()
export class TelegramUpdatesListenerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(TelegramUpdatesListenerService.name);
  private readonly clients = new Map<number, ActiveClient>();
  private leaderLockHeld = false;
  private leaderLockRunner: QueryRunner | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private startupPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
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

  private useLeaderLock(): boolean {
    const raw = this.config.get<string>("TELEGRAM_LISTENER_LEADER_LOCK")?.trim();
    if (raw === "false" || raw === "0") {
      return false;
    }
    if (raw === "true" || raw === "1") {
      return true;
    }
    return this.config.get<string>("NODE_ENV") === "production";
  }

  async onApplicationBootstrap(): Promise<void> {
    this.startupPromise = this.bootstrapListeners();
    await this.startupPromise;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.watchdogTimer != null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    const ids = [...this.clients.keys()];
    for (const id of ids) {
      await this.detachIntegration(id);
    }

    if (this.leaderLockHeld) {
      await this.releaseLeaderLock();
    }
  }

  private async releaseLeaderLock(): Promise<void> {
    if (!this.leaderLockRunner) {
      this.leaderLockHeld = false;
      return;
    }
    try {
      await this.leaderLockRunner.query("SELECT pg_advisory_unlock($1)", [
        TELEGRAM_LISTENER_ADVISORY_LOCK_KEY,
      ]);
    } catch {
      /* ignore */
    }
    try {
      await this.leaderLockRunner.release();
    } catch {
      /* ignore */
    }
    this.leaderLockRunner = null;
    this.leaderLockHeld = false;
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

    if (this.useLeaderLock()) {
      const acquired = await this.tryAcquireLeaderLock();
      if (!acquired) {
        await this.logLeaderLockHolderHint();
        this.log.log(
          "Telegram listener skipped on this instance: another replica holds the leader lock " +
            "(set TELEGRAM_LISTENER_LEADER_LOCK=false only for a single-instance deploy)",
        );
        return;
      }
      this.leaderLockHeld = true;
      this.log.log("Telegram listener leader lock acquired for this instance");
    }

    const rows = await this.fetchActiveIntegrations();

    await this.logActiveIntegrationsDiagnostics(rows);
    await this.reconcileIntegrations({ logSummary: true });

    if (this.leaderLockHeld || !this.useLeaderLock()) {
      this.watchdogTimer = setInterval(() => {
        void this.reconcileIntegrations();
      }, SYNC_INTERVAL_MS);
    }
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
    if (this.useLeaderLock() && !this.leaderLockHeld) {
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
          `Telegram listener startup complete: attached=${attached} reloaded=${reloaded} skipped=${skipped} failed=${failed}`,
        );
      } else if (attached > 0 || reloaded > 0 || this.clients.size !== rows.length) {
        this.log.log(
          `Telegram listener sync: running=${this.clients.size} db_active=${rows.length} attached=${attached} reloaded=${reloaded} skipped=${skipped} failed=${failed}`,
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

  private async tryAcquireLeaderLock(): Promise<boolean> {
    if (this.leaderLockRunner) {
      return this.leaderLockHeld;
    }

    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      const rows = (await runner.query(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        [TELEGRAM_LISTENER_ADVISORY_LOCK_KEY],
      )) as Array<{ acquired?: boolean }>;
      const acquired = rows[0]?.acquired === true;
      if (!acquired) {
        await runner.release();
        return false;
      }
      this.leaderLockRunner = runner;
      return true;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram listener leader lock unavailable: ${err}`);
      try {
        await runner.release();
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  private async logLeaderLockHolderHint(): Promise<void> {
    try {
      const rows = (await this.dataSource.query(
        `
        SELECT
          l.pid,
          l.granted,
          a.application_name,
          a.client_addr::text AS client_addr,
          a.state,
          a.backend_start
        FROM pg_locks AS l
        JOIN pg_stat_activity AS a ON a.pid = l.pid
        WHERE
          l.locktype = 'advisory'
          AND l.objid = $1
          AND l.classid = 0
        `,
        [TELEGRAM_LISTENER_ADVISORY_LOCK_KEY],
      )) as Array<{
        pid?: number;
        granted?: boolean;
        application_name?: string;
        client_addr?: string;
        state?: string;
        backend_start?: Date;
      }>;

      if (rows.length === 0) {
        this.log.warn(
          "Telegram leader lock is held but no pg_locks row found (stale connection or pooler)",
        );
        return;
      }

      for (const row of rows) {
        this.log.warn(
          `Telegram leader lock holder: pid=${row.pid ?? "?"} granted=${row.granted ?? "?"} ` +
            `app=${row.application_name ?? "?"} addr=${row.client_addr ?? "?"} state=${row.state ?? "?"}`,
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.debug(`Could not inspect Telegram leader lock holder: ${err}`);
    }
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
    if (this.useLeaderLock() && !this.leaderLockHeld) {
      return "skipped";
    }

    const session = integration.sessionString?.trim();
    if (!session || integration.status !== TelegramIntegrationStatus.ACTIVE) {
      return "skipped";
    }

    await this.detachIntegration(integration.id);

    const client = this.telegramApi.createConnectedClient(session);
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
   * AUTH_KEY_DUPLICATED recovery:
   * log → stop updates (destroy) → drop from memory → mark integration disconnected in DB.
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

    const active = this.clients.get(integration.id);
    const toDestroy = client ?? active?.client ?? null;

    this.clients.delete(integration.id);

    if (toDestroy) {
      await this.telegramApi.destroyClient(toDestroy);
    }

    try {
      await this.telegramRepo.update(
        { id: integration.id },
        {
          status: TelegramIntegrationStatus.DISCONNECTED,
          lastError: `AUTH_KEY_DUPLICATED: ${hint}`,
        },
      );
      this.log.log(
        `Telegram integration_id=${integration.id} marked disconnected after AUTH_KEY_DUPLICATED`,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.error(
        `Failed to update integration_id=${integration.id} after AUTH_KEY_DUPLICATED: ${err}`,
      );
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
