import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConversationMessage } from "../database/entities";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { ConversationsRealtimeService } from "./conversations-realtime.service";
import { ConversationsService } from "./conversations.service";

@Injectable()
export class ConversationMessageNotifyService {
  constructor(
    private readonly presenter: ConversationMessagePresenterService,
    private readonly realtime: ConversationsRealtimeService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations: ConversationsService,
  ) {}

  /**
   * `message` uses the same mapper as GET `/conversations/:id/messages` (`data[]` items).
   * Call only after the row is saved so DB fields (e.g. `system_updated_at`) are set.
   */
  async notifyPersistedMessage(
    row: ConversationMessage,
    ownerId: number,
  ): Promise<void> {
    const message = await this.presenter.mapPersistedRowToDto(row);
    const conversation = await this.conversations.getConversationForOwnerById(
      ownerId,
      row.conversationId,
    );
    this.realtime.emitUpdate(ownerId, row.conversationId, {
      message,
      conversation,
    });
  }

  async notifyConversationForOwner(
    ownerId: number,
    conversationId: number,
  ): Promise<void> {
    const conversation = await this.conversations.getConversationForOwnerById(
      ownerId,
      conversationId,
    );
    this.realtime.emitUpdate(ownerId, conversationId, { conversation });
  }
}
