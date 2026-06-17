import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WebhookEvent } from "../database/entities";
import { ConversationsAllocationService } from "../conversations/conversations-allocation.service";
import { parseInstagramWebhookFromRawPayload } from "./instagram-webhook-payload.types";
import { WEBHOOK_EVENT_PROVIDER_INSTAGRAM } from "./webhook-event-provider";
import { WebhookEventsService } from "./webhook-events.service";

@Injectable()
export class WebhookEventsWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(WebhookEventsWorkerService.name);
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly webhookEvents: WebhookEventsService,
    private readonly allocation: ConversationsAllocationService,
  ) {}

  isEnabled(): boolean {
    const flag = this.config
      .get<string>("WEBHOOK_EVENTS_WORKER_ENABLED")
      ?.trim();
    return flag !== "false" && flag !== "0";
  }

  private getConcurrency(): number {
    return this.parsePositiveInt(
      this.config.get<string>("WEBHOOK_EVENTS_WORKER_CONCURRENCY"),
      1,
    );
  }

  private getPollIntervalMs(): number {
    return this.parsePositiveInt(
      this.config.get<string>("WEBHOOK_EVENTS_WORKER_POLL_INTERVAL_MS"),
      1000,
    );
  }

  private getMaxAttempts(): number {
    return this.parsePositiveInt(
      this.config.get<string>("WEBHOOK_EVENTS_WORKER_MAX_ATTEMPTS"),
      5,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.log.log(
        "Webhook events worker disabled (WEBHOOK_EVENTS_WORKER_ENABLED=false)",
      );
      return;
    }

    const concurrency = this.getConcurrency();
    this.log.log(
      `Starting webhook events worker concurrency=${concurrency} pollIntervalMs=${this.getPollIntervalMs()} maxAttempts=${this.getMaxAttempts()}`,
    );
    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loopPromise;
  }

  private async runLoop(): Promise<void> {
    const pollIntervalMs = this.getPollIntervalMs();

    while (this.running) {
      try {
        const batch = await this.webhookEvents.claimForProcessing({
          limit: this.getConcurrency(),
          provider: WEBHOOK_EVENT_PROVIDER_INSTAGRAM,
          maxAttempts: this.getMaxAttempts(),
        });

        if (batch.length === 0) {
          await this.sleep(pollIntervalMs);
          continue;
        }

        await Promise.all(batch.map((event) => this.processEvent(event)));
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.error(`Webhook events worker loop error: ${err}`);
        await this.sleep(pollIntervalMs);
      }
    }
  }

  async processEvent(event: WebhookEvent): Promise<void> {
    const traceId = `webhook-event-${event.id}`;
    try {
      const parsed = parseInstagramWebhookFromRawPayload(event.rawPayload);
      if (!parsed) {
        throw new Error("Unsupported Instagram webhook payload shape");
      }

      if (parsed.kind === "payload") {
        await this.allocation.allocateInstagramMessagingWebhook(
          parsed.payload,
          traceId,
        );
      } else {
        await this.allocation.allocateInstagramMessagingWebhookEntry(
          parsed.entry,
          traceId,
        );
      }

      await this.webhookEvents.markProcessed(event.id);
      this.log.log(`Processed webhook event id=${event.id}`);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await this.webhookEvents.markFailed(event.id, err);
      this.log.warn(`Failed webhook event id=${event.id}: ${err}`);
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
