import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";
import type { ConversationRowDto } from "./dto/http/conversations-list-response.dto";
import type { InstagramMessageDto } from "./dto/http/instagram-messages-response.dto";

/** Single WebSocket payload — client upserts `conversation` / `message` by `id`. */
export type ConversationsRealtimePayload = {
  conversationId: number;
  conversation?: ConversationRowDto;
  message?: InstagramMessageDto;
};

@Injectable()
export class ConversationsRealtimeService {
  private readonly log = new Logger(ConversationsRealtimeService.name);
  private server: Server | null = null;

  bindServer(server: Server): void {
    this.server = server;
  }

  /**
   * `conversations.update` — same DTOs as REST list / message items.
   * Emitted to `conversation:{id}` and `owner:{ownerId}` (inbox).
   */
  emitUpdate(
    ownerId: number,
    conversationId: number,
    payload: Omit<ConversationsRealtimePayload, "conversationId">,
  ): void {
    if (!this.server) {
      this.log.debug(
        `WebSocket server not ready; skip push conversationId=${conversationId}`,
      );
      return;
    }

    const body: ConversationsRealtimePayload = {
      conversationId,
      ...payload,
    };

    this.server
      .to(this.conversationRoom(conversationId))
      .to(this.ownerRoom(ownerId))
      .emit("conversations.update", body);
  }

  conversationRoom(conversationDbId: number): string {
    return `conversation:${conversationDbId}`;
  }

  ownerRoom(ownerId: number): string {
    return `owner:${ownerId}`;
  }
}
