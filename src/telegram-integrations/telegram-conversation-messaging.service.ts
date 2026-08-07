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
  ConversationMessageType,
  ConversationSource,
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import { ConversationMediaArchiveService } from "../conversations/conversation-media-archive.service";
import type { OutboundConversationMessageMediaType } from "../conversations/dto/http/send-instagram-message-request.dto";
import type { SendInstagramMessageResponseDto } from "../conversations/dto/http/send-instagram-message-response.dto";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

type OutboundMessageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

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
    private readonly mediaArchive: ConversationMediaArchiveService,
  ) {}

  async sendMessageForConversation(
    ownerId: number,
    conv: Conversation,
    message: string,
    replyToExternalId?: string,
    file?: OutboundMessageFile,
    mediaType?: OutboundConversationMessageMediaType,
  ): Promise<SendInstagramMessageResponseDto> {
    void ownerId;
    if (conv.source !== ConversationSource.TELEGRAM) {
      throw new BadRequestException("Conversation is not a Telegram thread");
    }

    const hasFile = file != null && file.buffer.length > 0;
    const caption = message.trim();
    if (!hasFile && caption.length === 0) {
      throw new BadRequestException("message or file is required");
    }
    if (hasFile && !mediaType) {
      throw new BadRequestException(
        "type is required when sending a file (image, video, or audio)",
      );
    }

    const recipient = conv.participantId?.trim() ?? "";
    if (!recipient || !/^\d+$/.test(recipient)) {
      throw new BadRequestException(
        "Conversation has no valid participant_id (Telegram user id)",
      );
    }

    const integration = await this.resolveIntegration(conv);
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
        where: {
          conversationId: conv.id,
          workspaceId: conv.workspaceId,
          externalId: repliedToExternalId,
        },
      });
      if (!parentExists) {
        throw new BadRequestException(
          "reply_to_id must be the id of a message in this conversation (from GET .../messages).",
        );
      }
    }

    const connectedClient = this.updatesListener.getActiveClient(
      integration.id,
    );
    const sendOptions = {
      ...(replyToMessageId != null ? { replyToMessageId } : {}),
      ...(connectedClient ? { connectedClient } : {}),
    };

    const sent =
      hasFile && mediaType
        ? await this.telegramApi.sendPrivateMedia(session, recipient, file, {
            mediaType,
            caption: caption.length > 0 ? caption : undefined,
            ...sendOptions,
          })
        : await this.telegramApi.sendPrivateMessage(
            session,
            recipient,
            caption,
            sendOptions,
          );

    const externalMessageId = `tg:${sent.chatId}:${sent.messageId}`;
    const archiveContext = {
      conversationId: conv.id,
      messageExternalId: externalMessageId,
      messageAt: sent.date,
    };

    const storedAttachments =
      hasFile && mediaType
        ? await this.archiveOutboundFile(file, mediaType, archiveContext)
        : [];

    const messageType = this.resolveOutboundMessageType(
      mediaType,
      storedAttachments,
    );
    const displayText = this.resolveOutboundDisplayText(
      caption,
      hasFile,
      mediaType,
    );

    await this.persistence.persistOutboundMessage({
      integration,
      conversation: conv,
      text: displayText,
      telegramMessageId: sent.messageId,
      chatId: sent.chatId,
      repliedToExternalId,
      messageDate: sent.date,
      connectedClient,
      messageType,
      storedAttachments,
    });

    return {
      recipient_id: recipient,
      message_id: externalMessageId,
    };
  }

  private async archiveOutboundFile(
    file: OutboundMessageFile,
    mediaType: OutboundConversationMessageMediaType,
    archiveContext: {
      conversationId: number;
      messageExternalId: string;
      messageAt: Date;
    },
  ) {
    const archived = await this.mediaArchive.archiveOutboundAttachment({
      mediaType,
      buffer: file.buffer,
      contentType: file.mimetype ?? "application/octet-stream",
      filename: file.originalname?.trim() || `${mediaType}-upload`,
      context: archiveContext,
    });
    return archived ? [archived] : [];
  }

  private resolveOutboundMessageType(
    mediaType: OutboundConversationMessageMediaType | undefined,
    storedAttachments: { type: string }[],
  ): ConversationMessageType {
    if (storedAttachments.length > 0) {
      const first = storedAttachments[0]?.type;
      if (first === "image") {
        return ConversationMessageType.image;
      }
      if (first === "video") {
        return ConversationMessageType.video;
      }
      if (first === "audio") {
        return ConversationMessageType.audio;
      }
    }
    if (mediaType === "image") {
      return ConversationMessageType.image;
    }
    if (mediaType === "video") {
      return ConversationMessageType.video;
    }
    if (mediaType === "audio") {
      return ConversationMessageType.audio;
    }
    return ConversationMessageType.text;
  }

  private resolveOutboundDisplayText(
    caption: string,
    hasFile: boolean,
    mediaType?: OutboundConversationMessageMediaType,
  ): string {
    if (caption.length > 0) {
      return caption;
    }
    if (!hasFile || !mediaType) {
      return caption;
    }
    if (mediaType === "image") {
      return "[Photo]";
    }
    if (mediaType === "video") {
      return "[Video]";
    }
    return "[Audio]";
  }

  private async resolveIntegration(
    conv: Conversation,
  ): Promise<TelegramIntegration> {
    const sourceIdRaw = conv.externalSourceId?.trim();
    const integrationId = sourceIdRaw
      ? Number.parseInt(sourceIdRaw, 10)
      : Number.NaN;

    if (!Number.isInteger(integrationId) || integrationId <= 0) {
      throw new NotFoundException(
        "Conversation has no Telegram integration id (external_source_id)",
      );
    }

    const row = await this.telegramRepo.findOne({
      where: { id: integrationId },
    });
    if (!row) {
      throw new NotFoundException(
        `Telegram integration id=${integrationId} not found`,
      );
    }
    if (row.status !== TelegramIntegrationStatus.ACTIVE) {
      throw new ServiceUnavailableException(
        "Telegram integration for this conversation is not active",
      );
    }
    return row;
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
