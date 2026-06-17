import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookEvent } from "../database/entities";

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
}
