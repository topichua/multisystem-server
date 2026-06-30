import {
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

type ActiveClient = {
  client: TelegramClient;
  integration: TelegramIntegration;
};

/** PostgreSQL advisory lock id — only one deploy replica should run GramJS listeners. */
const TELEGRAM_LISTENER_ADVISORY_LOCK_KEY = 1_744_200_093;
const WATCHDOG_INTERVAL_MS = 120_000;

@Injectable()
export class TelegramUpdatesListenerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(TelegramUpdatesListenerService.name);
  private readonly clients = new Map<number, ActiveClient>();
  /** Integrations skipped due to AUTH_KEY_DUPLICATED — avoid watchdog retry spam. */
  private readonly sessionBusyIntegrationIds = new Set<number>();
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
        this.log.log(
          "Telegram listener skipped on this instance: another replica holds the leader lock " +
            "(set TELEGRAM_LISTENER_LEADER_LOCK=false only for a single-instance deploy)",
        );
        return;
      }
      this.leaderLockHeld = true;
      this.log.log("Telegram listener leader lock acquired for this instance");
    }

    await this.attachAllActiveIntegrations();

    if (this.leaderLockHeld || !this.useLeaderLock()) {
      this.watchdogTimer = setInterval(() => {
        void this.runWatchdog();
      }, WATCHDOG_INTERVAL_MS);
    }
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

  private async attachAllActiveIntegrations(): Promise<void> {
    const rows = await this.telegramRepo.find({
      where: {
        status: TelegramIntegrationStatus.ACTIVE,
        sessionString: Not(IsNull()),
      },
    });

    this.log.log(`Starting Telegram listeners for ${rows.length} integration(s)`);

    let attached = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      if (this.sessionBusyIntegrationIds.has(row.id)) {
        continue;
      }
      const result = await this.attachIntegrationWithRetry(row);
      if (result === "attached") {
        attached += 1;
      } else if (result === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
      }
    }

    this.log.log(
      `Telegram listener startup complete: attached=${attached} skipped=${skipped} failed=${failed}`,
    );
  }

  private async runWatchdog(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (this.useLeaderLock() && !this.leaderLockHeld) {
      return;
    }

    try {
      const rows = await this.telegramRepo.find({
        where: {
          status: TelegramIntegrationStatus.ACTIVE,
          sessionString: Not(IsNull()),
        },
      });

      for (const row of rows) {
        if (this.clients.has(row.id) || this.sessionBusyIntegrationIds.has(row.id)) {
          continue;
        }
        this.log.warn(
          `Telegram listener missing for integration_id=${row.id}; attempting re-attach`,
        );
        await this.attachIntegrationWithRetry(row);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram listener watchdog failed: ${err}`);
    }
  }

  async attachIntegration(integration: TelegramIntegration): Promise<void> {
    this.sessionBusyIntegrationIds.delete(integration.id);
    await this.attachIntegrationWithRetry(integration);
  }

  private async attachIntegrationWithRetry(
    integration: TelegramIntegration,
  ): Promise<"attached" | "skipped" | "failed"> {
    const result = await this.attachIntegrationOnce(integration);
    if (result === "auth_key_duplicated") {
      this.sessionBusyIntegrationIds.add(integration.id);
      this.log.warn(
        `Telegram listener skipped integration_id=${integration.id}: AUTH_KEY_DUPLICATED (session used elsewhere); continuing with other integrations`,
      );
      return "skipped";
    }
    if (result === "attached") {
      this.sessionBusyIntegrationIds.delete(integration.id);
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
        await client.disconnect();
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

      this.clients.set(integration.id, { client, integration });
      this.log.log(
        `Telegram listener attached integration_id=${integration.id} phone=${integration.phoneNumber}`,
      );
      return "attached";
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (this.isAuthKeyDuplicated(e)) {
        try {
          await client.disconnect();
        } catch {
          /* ignore */
        }
        return "auth_key_duplicated";
      }

      this.log.error(
        `Failed to attach Telegram listener id=${integration.id}: ${err}`,
      );
      try {
        await client.disconnect();
      } catch {
        /* ignore */
      }
      return "failed";
    }
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
    try {
      await active.client.disconnect();
    } catch {
      /* ignore */
    }
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
