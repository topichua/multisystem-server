import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookEvent, WebhookEventStatus } from "../database/entities";

export type ClaimWebhookEventsOptions = {
  limit: number;
  provider: string;
  maxAttempts: number;
};

@Injectable()
export class WebhookEventsService {
  constructor(
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
  ) {}

  async getById(id: number): Promise<WebhookEvent> {
    const row = await this.webhookEventRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException("Webhook event not found");
    }
    return row;
  }

  async claimForProcessing(
    options: ClaimWebhookEventsOptions,
  ): Promise<WebhookEvent[]> {
    return this.webhookEventRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(WebhookEvent);
      const events = await repo
        .createQueryBuilder("event")
        .where("event.provider = :provider", { provider: options.provider })
        .andWhere(
          "(event.status IN (:...freshStatuses) OR (event.status = :failedStatus AND event.attempts < :maxAttempts))",
          {
            freshStatuses: [
              WebhookEventStatus.PENDING,
              WebhookEventStatus.QUEUED,
            ],
            failedStatus: WebhookEventStatus.FAILED,
            maxAttempts: options.maxAttempts,
          },
        )
        .orderBy("event.receivedAt", "ASC")
        .limit(options.limit)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .getMany();

      if (events.length === 0) {
        return [];
      }

      const now = new Date();
      for (const event of events) {
        event.status = WebhookEventStatus.PROCESSING;
        event.processingAt = now;
        event.attempts += 1;
      }

      return repo.save(events);
    });
  }

  async markProcessed(id: number): Promise<void> {
    await this.webhookEventRepo.update(id, {
      status: WebhookEventStatus.PROCESSED,
      processedAt: new Date(),
      error: null,
    });
  }

  async markFailed(id: number, error: string): Promise<void> {
    await this.webhookEventRepo.update(id, {
      status: WebhookEventStatus.FAILED,
      error,
    });
  }
}
