import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";
import type { InstagramMessageDto } from "./dto/http/instagram-messages-response.dto";

export type ConversationMessageRealtimePayload = {
  conversationId: number;
  message: InstagramMessageDto;
};

@Injectable()
export class ConversationsRealtimeService {
  private readonly log = new Logger(ConversationsRealtimeService.name);
  private server: Server | null = null;

  bindServer(server: Server): void {
    this.server = server;
  }

  /**
   * Pushes one message in the same shape as `GET /conversations/:id/messages` items.
   * Clients subscribed to room `conversation:{id}` receive `conversation.message`.
   */
  emitConversationMessage(
    conversationDbId: number,
    message: InstagramMessageDto,
  ): void {
    if (!this.server) {
      this.log.debug(
        `WebSocket server not ready; skip push conversationId=${conversationDbId}`,
      );
      return;
    }

    const payload: ConversationMessageRealtimePayload = {
      conversationId: conversationDbId,
      message,
    };

    this.server
      .to(this.conversationRoom(conversationDbId))
      .emit("conversation.message", payload);
  }

  conversationRoom(conversationDbId: number): string {
    return `conversation:${conversationDbId}`;
  }

  ownerRoom(ownerId: number): string {
    return `owner:${ownerId}`;
  }
}
