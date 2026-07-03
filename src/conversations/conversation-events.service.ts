import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ConversationEvent,
  ConversationEventType,
} from "../database/entities";

export type ConversationEventPayload = Record<string, unknown>;

@Injectable()
export class ConversationEventsService {
  constructor(
    @InjectRepository(ConversationEvent)
    private readonly eventRepo: Repository<ConversationEvent>,
  ) {}

  async append(
    conversationId: number,
    type: ConversationEventType,
    actorId: number | null,
    payload: ConversationEventPayload | null,
  ): Promise<ConversationEvent> {
    const row = this.eventRepo.create({
      conversationId,
      type,
      actorId,
      payload,
    });
    return this.eventRepo.save(row);
  }

  async listForConversation(conversationId: number): Promise<ConversationEvent[]> {
    return this.eventRepo.find({
      where: { conversationId },
      order: { createdAt: "DESC", id: "DESC" },
    });
  }
}
