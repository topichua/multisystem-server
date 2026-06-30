import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
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

type ActiveClient = {
  client: TelegramClient;
  integration: TelegramIntegration;
};

@Injectable()
export class TelegramUpdatesListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(TelegramUpdatesListenerService.name);
  private readonly clients = new Map<number, ActiveClient>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    private readonly telegramApi: TelegramUserApiService,
    private readonly persistence: TelegramMessagePersistenceService,
  ) {}

  isEnabled(): boolean {
    const flag = this.config.get<string>("TELEGRAM_LISTENER_ENABLED")?.trim();
    return flag !== "false" && flag !== "0";
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.log.log("Telegram message listener disabled (TELEGRAM_LISTENER_ENABLED=false)");
      return;
    }
    try {
      this.telegramApi.getCredentials();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram listener not started: ${err}`);
      return;
    }

    const rows = await this.telegramRepo.find({
      where: {
        status: TelegramIntegrationStatus.ACTIVE,
        sessionString: Not(IsNull()),
      },
    });
    this.log.log(`Starting Telegram listeners for ${rows.length} integration(s)`);
    for (const row of rows) {
      await this.attachIntegration(row);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const ids = [...this.clients.keys()];
    for (const id of ids) {
      await this.detachIntegration(id);
    }
  }

  async attachIntegration(integration: TelegramIntegration): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    const session = integration.sessionString?.trim();
    if (!session || integration.status !== TelegramIntegrationStatus.ACTIVE) {
      return;
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
        return;
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
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (this.isSkippableAttachError(e)) {
        this.log.warn(
          `Telegram listener skipped integration_id=${integration.id}: ${err}`,
        );
      } else {
        this.log.error(
          `Failed to attach Telegram listener id=${integration.id}: ${err}`,
        );
      }
      try {
        await client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private isSkippableAttachError(err: unknown): boolean {
    const msg = this.telegramErrorMessage(err);
    return msg.includes("AUTH_KEY_DUPLICATED");
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
