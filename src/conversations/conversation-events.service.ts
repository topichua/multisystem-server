import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConversationEvent, ConversationEventType } from "../database/entities";

export type ConversationEventPayload = Record<string, unknown>;

@Injectable()
export class ConversationEventsService {
  constructor(
    @InjectRepository(ConversationEvent)
    private readonly eventRepo: Repository<ConversationEvent>,
  ) {}

  async append(
    conversation: { id: number; workspaceId: number },
    type: ConversationEventType,
    actorId: number | null,
    payload: ConversationEventPayload | null,
  ): Promise<ConversationEvent> {
    const row = this.eventRepo.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      type,
      actorId,
      payload,
    });
    return this.eventRepo.save(row);
  }

  async listForConversation(
    conversation: { id: number; workspaceId: number },
  ): Promise<ConversationEvent[]> {
    return this.eventRepo.find({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
      order: { createdAt: "DESC", id: "DESC" },
    });
  }

  async existsOfType(
    conversation: { id: number; workspaceId: number },
    type: ConversationEventType,
    payloadPostId?: string,
  ): Promise<boolean> {
    const rows = await this.eventRepo.find({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        type,
      },
      select: { id: true, payload: true },
    });
    if (payloadPostId == null || payloadPostId.length === 0) {
      return rows.length > 0;
    }
    return rows.some((row) => {
      const postId =
        row.payload != null && typeof row.payload.postId === "string"
          ? row.payload.postId.trim()
          : "";
      return postId === payloadPostId;
    });
  }
}
