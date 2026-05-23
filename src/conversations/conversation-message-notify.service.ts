import { Injectable } from "@nestjs/common";
import { ConversationMessage } from "../database/entities";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { ConversationsRealtimeService } from "./conversations-realtime.service";

/** Maps persisted rows to API DTOs and pushes over WebSocket (no extra DB reads). */
@Injectable()
export class ConversationMessageNotifyService {
  constructor(
    private readonly presenter: ConversationMessagePresenterService,
    private readonly realtime: ConversationsRealtimeService,
  ) {}

  async notifyPersistedMessage(row: ConversationMessage): Promise<void> {
    const message = await this.presenter.mapPersistedRowToDto(row);
    this.realtime.emitConversationMessage(row.conversationId, message);
  }
}
