import { BadRequestException, forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Api, utils } from "telegram";
import type { TelegramClient } from "telegram";
import type { NewMessageEvent } from "telegram/events";
import { Repository } from "typeorm";
import {
  Conversation,
  ConversationMessage,
  ConversationSource,
  TelegramIntegration,
} from "../database/entities";
import { ConversationMessageNotifyService } from "../conversations/conversation-message-notify.service";
import { CloudflareImagesService } from "../products/cloudflare-images.service";
import { TelegramUsersService } from "./telegram-users.service";

@Injectable()
export class TelegramMessagePersistenceService {
  private readonly log = new Logger(TelegramMessagePersistenceService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    private readonly messageNotify: ConversationMessageNotifyService,
    private readonly cloudflareImages: CloudflareImagesService,
    @Inject(forwardRef(() => TelegramUsersService))
    private readonly telegramUsers: TelegramUsersService,
  ) {}

  /**
   * Persists a Telegram update into `conversations` + `conversation_messages`
   * (reuses `instagram_json` column for stored platform payload).
   */
  async persistNewMessageEvent(
    integration: TelegramIntegration,
    event: NewMessageEvent,
    connectedClient?: TelegramClient,
  ): Promise<void> {
    const msg = event.message;
    if (!msg?.id) {
      return;
    }

    const ownerId = integration.ownerId;
    const myUserId = integration.telegramUserId?.trim();
    if (!myUserId) {
      return;
    }

    if (!event.isPrivate) {
      return;
    }

    const chatId = this.bigIntToId(event.chatId);
    if (!chatId) {
      return;
    }

    const {
      participantId,
      senderId: effectiveSenderId,
      receiverId,
      isOutgoing,
    } = this.resolvePrivateMessageActors(msg, chatId, myUserId);

    const messageDate =
      typeof msg.date === "number"
        ? new Date(msg.date * 1000)
        : new Date();
    let photoContent = this.extractPhotoContent(msg);
    let cdnUrl: string | null = null;
    if (photoContent && connectedClient) {
      cdnUrl = await this.uploadTelegramPhotoToCdn(connectedClient, msg, chatId);
      if (cdnUrl) {
        photoContent = this.extractPhotoContent(msg, cdnUrl);
      }
    }
    const text = photoContent
      ? photoContent.displayText
      : (msg.message ?? "").trim() || "[non-text message]";
    const externalMessageId = `tg:${chatId}:${msg.id}`;
    const externalConversationId = `telegram:private:${chatId}`;

    const { conv, convSaved } = await this.ensureConversation({
      integration,
      ownerId,
      participantId,
      externalConversationId,
      messageDate,
    });
    if (convSaved) {
      await this.conversationRepo.save(conv);
    } else if (conv.instUpdatedAt.getTime() < messageDate.getTime()) {
      conv.instUpdatedAt = messageDate;
      await this.conversationRepo.save(conv);
    }

    await this.syncParticipantOnPersist(
      integration,
      participantId,
      connectedClient,
    );

    const existing = await this.conversationMessageRepo.findOne({
      where: { externalId: externalMessageId },
    });
    if (existing) {
      return;
    }

    const instagramJson = JSON.stringify(
      this.buildStoredPayload({
        externalMessageId,
        messageDate,
        text,
        senderId: effectiveSenderId,
        receiverId,
        chatId,
        messageId: String(msg.id),
        isOutgoing,
        attachments: photoContent?.attachments,
        raw: {
          peerId: chatId,
          out: msg.out ?? isOutgoing,
          ...(photoContent ? { mediaType: "photo" } : {}),
          ...(cdnUrl ? { cdnUrl } : {}),
        },
      }),
    );

    const row = this.conversationMessageRepo.create({
      conversationId: conv.id,
      externalId: externalMessageId,
      message: text,
      instagramJson,
      createdAt: messageDate,
      senderId: effectiveSenderId,
      receiverId,
      readAt: null,
      repliedToExternalId: this.extractReplyToExternalId(msg, chatId),
    });

    const saved = await this.conversationMessageRepo.save(row);
    await this.messageNotify.notifyPersistedMessage(saved, ownerId);

    this.log.debug(
      `Saved telegram message id=${externalMessageId} conversation_id=${conv.id} integration_id=${integration.id}`,
    );
  }

  /** Persists an outbound message after POST .../messages (avoids waiting for NewMessage). */
  async persistOutboundMessage(params: {
    integration: TelegramIntegration;
    conversation: Conversation;
    text: string;
    telegramMessageId: number;
    chatId: string;
    repliedToExternalId: string | null;
    messageDate: Date;
    connectedClient?: TelegramClient;
  }): Promise<ConversationMessage> {
    const {
      integration,
      conversation,
      text,
      telegramMessageId,
      chatId,
      repliedToExternalId,
      messageDate,
      connectedClient,
    } = params;
    const ownerId = integration.ownerId;
    const myUserId = integration.telegramUserId?.trim();
    if (!myUserId) {
      throw new BadRequestException(
        "Telegram integration has no telegram_user_id",
      );
    }

    const externalMessageId = `tg:${chatId}:${telegramMessageId}`;
    const participantId = conversation.participantId?.trim() || chatId;

    await this.syncParticipantOnPersist(
      integration,
      participantId,
      connectedClient,
    );

    const existing = await this.conversationMessageRepo.findOne({
      where: { externalId: externalMessageId },
    });
    if (existing) {
      return existing;
    }

    const receiverId = participantId;
    const effectiveSenderId = myUserId;

    if (conversation.instUpdatedAt.getTime() < messageDate.getTime()) {
      conversation.instUpdatedAt = messageDate;
      await this.conversationRepo.save(conversation);
    }

    const instagramJson = JSON.stringify(
      this.buildStoredPayload({
        externalMessageId,
        messageDate,
        text,
        senderId: effectiveSenderId,
        receiverId,
        chatId,
        messageId: String(telegramMessageId),
        isOutgoing: true,
        raw: { peerId: chatId, out: true, sent: true },
      }),
    );

    const row = this.conversationMessageRepo.create({
      conversationId: conversation.id,
      externalId: externalMessageId,
      message: text,
      instagramJson,
      createdAt: messageDate,
      senderId: effectiveSenderId,
      receiverId,
      readAt: null,
      repliedToExternalId,
    });

    const saved = await this.conversationMessageRepo.save(row);
    await this.messageNotify.notifyPersistedMessage(saved, ownerId);
    return saved;
  }

  private async ensureConversation(params: {
    integration: TelegramIntegration;
    ownerId: number;
    participantId: string;
    externalConversationId: string;
    messageDate: Date;
  }): Promise<{ conv: Conversation; convSaved: boolean }> {
    const { integration, ownerId, participantId, externalConversationId, messageDate } =
      params;

    let row = await this.conversationRepo.findOne({
      where: {
        managerId: ownerId,
        participantId,
        source: ConversationSource.TELEGRAM,
      },
      order: { id: "DESC" },
    });
    if (row) {
      return { conv: row, convSaved: false };
    }

    row = await this.conversationRepo.findOne({
      where: {
        managerId: ownerId,
        externalId: externalConversationId,
      },
    });
    if (row) {
      return { conv: row, convSaved: false };
    }

    row = this.conversationRepo.create({
      externalSourceId: String(integration.id),
      externalId: externalConversationId,
      instUpdatedAt: messageDate,
      readAt: null,
      participantId,
      source: ConversationSource.TELEGRAM,
      managerId: ownerId,
      workspaceId: integration.workspaceId,
      groupId: null,
    });
    return { conv: row, convSaved: true };
  }

  private buildStoredPayload(params: {
    externalMessageId: string;
    messageDate: Date;
    text: string;
    senderId: string;
    receiverId: string;
    chatId: string;
    messageId: string;
    isOutgoing: boolean;
    attachments?: { data: Array<Record<string, unknown>> };
    raw: Record<string, unknown>;
  }): Record<string, unknown> {
    const {
      externalMessageId,
      messageDate,
      text,
      senderId,
      receiverId,
      chatId,
      messageId,
      isOutgoing,
      attachments,
      raw,
    } = params;
    return {
      id: externalMessageId,
      created_time: messageDate.toISOString(),
      ...(text.length > 0 ? { message: text } : {}),
      from: { id: senderId },
      to: { data: [{ id: receiverId }] },
      ...(attachments ? { attachments } : {}),
      platform: "telegram",
      telegram: {
        chatId,
        messageId,
        out: isOutgoing,
        ...raw,
      },
    };
  }

  private async uploadTelegramPhotoToCdn(
    client: TelegramClient,
    msg: NonNullable<NewMessageEvent["message"]>,
    chatId: string,
  ): Promise<string | null> {
    try {
      const downloaded = await client.downloadMedia(msg, {});
      if (downloaded == null) {
        return null;
      }
      const buffer = Buffer.isBuffer(downloaded)
        ? downloaded
        : Buffer.from(downloaded);
      if (buffer.length === 0) {
        return null;
      }

      const uploaded = await this.cloudflareImages.uploadImage({
        buffer,
        mimetype: "image/jpeg",
        originalname: `telegram-${chatId}-${msg.id}.jpg`,
      });
      return uploaded.cdnUrl;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram photo Cloudflare upload failed chat=${chatId}: ${err}`);
      return null;
    }
  }

  private extractPhotoContent(
    msg: NonNullable<NewMessageEvent["message"]>,
    cdnUrl?: string,
  ): {
    displayText: string;
    attachments: { data: Array<Record<string, unknown>> };
  } | null {
    const media = msg.media;
    if (!(media instanceof Api.MessageMediaPhoto)) {
      return null;
    }

    const photo = media.photo;
    if (!(photo instanceof Api.Photo)) {
      return null;
    }

    const largest = this.pickLargestPhotoSize(photo.sizes ?? []);
    const caption = (msg.message ?? "").trim();
    const imageData: Record<string, unknown> = {
      ...(largest
        ? {
            width: largest.w,
            height: largest.h,
          }
        : {}),
      ...(cdnUrl
        ? {
            url: cdnUrl,
            preview_url: cdnUrl,
          }
        : {}),
      telegram: {
        photoId: this.bigIntToId(photo.id),
        accessHash: this.bigIntToId(photo.accessHash),
        dcId: photo.dcId,
        ...(photo.fileReference
          ? { fileReference: Buffer.from(photo.fileReference).toString("base64") }
          : {}),
        ...(largest && "type" in largest
          ? {
              sizeType: largest.type,
              ...(largest instanceof Api.PhotoSize
                ? { byteSize: largest.size }
                : {}),
            }
          : {}),
      },
    };

    return {
      displayText: caption || cdnUrl || "[Photo]",
      attachments: {
        data: [
          {
            mime_type: "image/jpeg",
            name: "photo.jpg",
            ...(cdnUrl ? { file_url: cdnUrl } : {}),
            image_data: imageData,
          },
        ],
      },
    };
  }

  private pickLargestPhotoSize(
    sizes: Api.TypePhotoSize[],
  ): Api.PhotoSize | Api.PhotoSizeProgressive | null {
    let best: Api.PhotoSize | Api.PhotoSizeProgressive | null = null;
    let bestArea = 0;

    for (const size of sizes) {
      if (
        !(size instanceof Api.PhotoSize) &&
        !(size instanceof Api.PhotoSizeProgressive)
      ) {
        continue;
      }
      const area = size.w * size.h;
      if (area > bestArea) {
        bestArea = area;
        best = size;
      }
    }

    return best;
  }

  private extractReplyToExternalId(
    msg: NewMessageEvent["message"],
    chatId: string,
  ): string | null {
    if (!msg) {
      return null;
    }
    const replyTo = msg.replyTo;
    if (replyTo && "replyToMsgId" in replyTo && replyTo.replyToMsgId != null) {
      return `tg:${chatId}:${replyTo.replyToMsgId}`;
    }
    return null;
  }

  /**
   * Instagram-style semantics: incoming → participant sends, connected account receives;
   * outgoing → connected account sends, participant receives.
   */
  private resolvePrivateMessageActors(
    msg: NonNullable<NewMessageEvent["message"]>,
    chatId: string,
    myUserId: string,
  ): {
    participantId: string;
    senderId: string;
    receiverId: string;
    isOutgoing: boolean;
  } {
    const senderFromMessage = this.resolveSenderUserIdFromMessage(msg);
    let participantId = chatId;
    if (participantId === myUserId && senderFromMessage !== myUserId) {
      participantId = senderFromMessage || participantId;
    }

    const isFromMe =
      Boolean(msg.out) ||
      (senderFromMessage.length > 0 && senderFromMessage === myUserId);

    const senderId = isFromMe ? myUserId : participantId;
    const receiverId = isFromMe ? participantId : myUserId;

    return {
      participantId,
      senderId,
      receiverId,
      isOutgoing: isFromMe,
    };
  }

  private resolveSenderUserIdFromMessage(
    msg: NonNullable<NewMessageEvent["message"]>,
  ): string {
    if (msg.fromId) {
      try {
        return utils.getPeerId(msg.fromId);
      } catch {
        if (msg.fromId instanceof Api.PeerUser) {
          return this.bigIntToId(msg.fromId.userId);
        }
      }
    }
    if (msg.senderId != null) {
      return this.bigIntToId(msg.senderId);
    }
    if (!msg.out && msg.peerId instanceof Api.PeerUser) {
      return this.bigIntToId(msg.peerId.userId);
    }
    return "";
  }

  private bigIntToId(value: unknown): string {
    if (value == null) {
      return "";
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "object" && "value" in (value as object)) {
      return String((value as { value: bigint }).value);
    }
    return String(value);
  }

  private async syncParticipantOnPersist(
    integration: TelegramIntegration,
    participantId: string,
    connectedClient?: TelegramClient,
  ): Promise<void> {
    try {
      await this.telegramUsers.syncParticipantForIntegration(
        integration,
        participantId,
        connectedClient,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `telegram_users sync failed participantId=${participantId}: ${err}`,
      );
    }
  }
}
