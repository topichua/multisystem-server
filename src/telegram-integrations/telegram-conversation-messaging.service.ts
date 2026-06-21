import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Conversation,
  ConversationMessage,
  ConversationSource,
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import type { SendInstagramMessageResponseDto } from "../conversations/dto/http/send-instagram-message-response.dto";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

@Injectable()
export class TelegramConversationMessagingService {
  constructor(
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    private readonly telegramApi: TelegramUserApiService,
    private readonly updatesListener: TelegramUpdatesListenerService,
    @Inject(forwardRef(() => TelegramMessagePersistenceService))
    private readonly persistence: TelegramMessagePersistenceService,
  ) {}

  async sendMessageForConversation(
    ownerId: number,
    conv: Conversation,
    message: string,
    replyToExternalId?: string,
  ): Promise<SendInstagramMessageResponseDto> {
    if (conv.source !== ConversationSource.TELEGRAM) {
      throw new BadRequestException("Conversation is not a Telegram thread");
    }

    const text = message.trim();
    if (!text) {
      throw new BadRequestException("message must not be empty");
    }

    const recipient = conv.participantId?.trim() ?? "";
    if (!recipient || !/^\d+$/.test(recipient)) {
      throw new BadRequestException(
        "Conversation has no valid participant_id (Telegram user id)",
      );
    }

    const integration = await this.resolveIntegration(ownerId, conv);
    const session = integration.sessionString?.trim();
    if (!session) {
      throw new ServiceUnavailableException(
        "Telegram account is not connected; complete login at POST /telegram-integrations",
      );
    }

    let replyToMessageId: number | undefined;
    let repliedToExternalId: string | null = null;
    const replyRaw = replyToExternalId?.trim();
    if (replyRaw) {
      replyToMessageId = this.parseReplyToMessageId(replyRaw, recipient);
      repliedToExternalId = `tg:${recipient}:${replyToMessageId}`;
      const parentExists = await this.conversationMessageRepo.exist({
        where: { conversationId: conv.id, externalId: repliedToExternalId },
      });
      if (!parentExists) {
        throw new BadRequestException(
          "reply_to_id must be the id of a message in this conversation (from GET .../messages).",
        );
      }
    }

    const connectedClient = this.updatesListener.getActiveClient(integration.id);
    const sent = await this.telegramApi.sendPrivateMessage(
      session,
      recipient,
      text,
      {
        ...(replyToMessageId != null ? { replyToMessageId } : {}),
        ...(connectedClient ? { connectedClient } : {}),
      },
    );

    const externalMessageId = `tg:${sent.chatId}:${sent.messageId}`;
    await this.persistence.persistOutboundMessage({
      integration,
      conversation: conv,
      text,
      telegramMessageId: sent.messageId,
      chatId: sent.chatId,
      repliedToExternalId,
      messageDate: sent.date,
      connectedClient,
    });

    return {
      recipient_id: recipient,
      message_id: externalMessageId,
    };
  }

  private async resolveIntegration(
    ownerId: number,
    conv: Conversation,
  ): Promise<TelegramIntegration> {
    const sourceIdRaw = conv.externalSourceId?.trim();
    const integrationId = sourceIdRaw
      ? Number.parseInt(sourceIdRaw, 10)
      : Number.NaN;

    if (Number.isInteger(integrationId) && integrationId > 0) {
      const row = await this.telegramRepo.findOne({
        where: { id: integrationId, ownerId },
      });
      if (row?.status === TelegramIntegrationStatus.ACTIVE) {
        return row;
      }
    }

    const fallback = await this.telegramRepo.findOne({
      where: {
        ownerId,
        status: TelegramIntegrationStatus.ACTIVE,
      },
      order: { id: "DESC" },
    });
    if (!fallback) {
      throw new NotFoundException(
        "No active Telegram integration found for this conversation",
      );
    }
    return fallback;
  }

  private parseReplyToMessageId(
    replyToExternalId: string,
    chatId: string,
  ): number {
    const match = replyToExternalId.match(/^tg:(\d+):(\d+)$/);
    if (!match) {
      throw new BadRequestException(
        "reply_to_id must be a Telegram message id from GET .../messages (format tg:{chatId}:{messageId})",
      );
    }
    if (match[1] !== chatId) {
      throw new BadRequestException(
        "reply_to_id does not belong to this conversation",
      );
    }
    const msgId = Number.parseInt(match[2], 10);
    if (!Number.isInteger(msgId) || msgId <= 0) {
      throw new BadRequestException("reply_to_id has an invalid message id");
    }
    return msgId;
  }
}
