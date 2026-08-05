import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Api, utils } from "telegram";
import type { TelegramClient } from "telegram";
import type { DeletedMessageEvent } from "telegram/events/DeletedMessage";
import type { EditedMessageEvent } from "telegram/events/EditedMessage";
import type { NewMessageEvent } from "telegram/events";
import { Repository } from "typeorm";
import {
  Conversation,
  ConversationMessage,
  ConversationMessageType,
  ConversationSource,
  TelegramIntegration,
} from "../database/entities";
import {
  resolveMessageTypeFromAttachments,
  serializeAttachmentsJson,
  type StoredMessageAttachment,
} from "../conversations/conversation-message-attachments-json.util";
import { ConversationMessageNotifyService } from "../conversations/conversation-message-notify.service";
import { ConversationMediaArchiveService } from "../conversations/conversation-media-archive.service";
import {
  serializeReactionsJson,
  type StoredMessageReaction,
} from "../conversations/conversation-message-reactions-json.util";
import { ConversationWorkflowService } from "../conversations/conversation-workflow.service";
import { ChatAutoDistributionService } from "../conversations/chat-auto-distribution.service";
import { CloudflareImagesService } from "../products/cloudflare-images.service";
import { TelegramUsersService } from "./telegram-users.service";
import {
  extractGramPeerUserId,
  extractGramReactionEmoticon,
  isGramMessagePeerReaction,
  isGramMessageReactions,
  isGramReactionCount,
} from "./telegram-gramjs-update.util";

@Injectable()
export class TelegramMessagePersistenceService {
  private readonly log = new Logger(TelegramMessagePersistenceService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    private readonly messageNotify: ConversationMessageNotifyService,
    private readonly mediaArchive: ConversationMediaArchiveService,
    private readonly cloudflareImages: CloudflareImagesService,
    @Inject(forwardRef(() => TelegramUsersService))
    private readonly telegramUsers: TelegramUsersService,
    private readonly conversationWorkflow: ConversationWorkflowService,
    private readonly chatAutoDistribution: ChatAutoDistributionService,
  ) {}

  /**
   * Persists a Telegram update into `conversations` + `conversation_messages`
   * (reuses `instagram_json` column for stored platform payload).
   */
  async persistEditedMessageEvent(
    integration: TelegramIntegration,
    event: EditedMessageEvent,
    connectedClient?: TelegramClient,
  ): Promise<void> {
    const msg = event.message;
    if (!msg?.id) {
      return;
    }

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

    const externalMessageId = `tg:${chatId}:${msg.id}`;
    const row = await this.conversationMessageRepo.findOne({
      where: { externalId: externalMessageId },
    });
    if (!row) {
      this.log.debug(
        `Telegram edit skipped: message not in DB id=${externalMessageId} integration_id=${integration.id}`,
      );
      return;
    }

    const conv = await this.conversationRepo.findOne({
      where: { id: row.conversationId },
    });
    if (
      !conv ||
      conv.source !== ConversationSource.TELEGRAM ||
      conv.externalSourceId !== String(integration.id)
    ) {
      return;
    }

    const { participantId, isOutgoing } = this.resolvePrivateMessageActors(
      msg,
      chatId,
      myUserId,
    );
    const { text, attachments, rawExtras, storedAttachments, messageType } =
      await this.resolvePrivateMessageContent(
        msg,
        chatId,
        participantId,
        connectedClient,
        {
          conversationId: conv.id,
          messageExternalId: externalMessageId,
          messageAt: row.createdAt,
        },
      );
    const editedAt =
      typeof msg.editDate === "number"
        ? new Date(msg.editDate * 1000)
        : new Date();

    const storedPayload = this.buildStoredPayload({
      externalMessageId,
      messageDate: row.createdAt,
      text,
      senderId: row.senderId,
      receiverId: row.receiverId,
      chatId,
      messageId: String(msg.id),
      isOutgoing,
      attachments,
      raw: {
        peerId: chatId,
        out: msg.out ?? isOutgoing,
        edited: true,
        ...rawExtras,
      },
    });
    row.message = text;
    row.instagramJson = JSON.stringify(
      this.mergeStoredPayload(row.instagramJson, storedPayload),
    );
    row.editedAt = editedAt;
    row.attachmentJson = serializeAttachmentsJson(storedAttachments);
    row.messageType = messageType;

    const saved = await this.conversationMessageRepo.save(row);
    await this.messageNotify.notifyPersistedMessage(saved, integration.ownerId);

    this.log.debug(
      `Updated telegram message edit id=${externalMessageId} conversation_id=${conv.id} integration_id=${integration.id}`,
    );
  }

  async persistDeletedMessageEvent(
    integration: TelegramIntegration,
    event: DeletedMessageEvent,
  ): Promise<void> {
    const deletedIds = event.deletedIds ?? [];
    if (deletedIds.length === 0) {
      return;
    }

    let chatId: string | null = null;
    if (event.peer) {
      try {
        chatId = utils.getPeerId(event.peer);
      } catch {
        chatId = this.bigIntToId(event.peer);
      }
      if (!chatId) {
        chatId = null;
      }
    }

    for (const messageId of deletedIds) {
      if (!Number.isInteger(messageId) || messageId <= 0) {
        continue;
      }
      const deletedRows = await this.deletePersistedTelegramMessage(
        integration,
        messageId,
        chatId,
      );
      for (const row of deletedRows) {
        await this.messageNotify.notifyPersistedMessage(
          row,
          integration.ownerId,
        );
      }
    }
  }

  async persistMessageReactionsUpdate(
    integration: TelegramIntegration,
    update: Api.UpdateMessageReactions,
  ): Promise<void> {
    const msgId = update.msgId;
    if (msgId == null || !Number.isInteger(msgId) || msgId <= 0) {
      return;
    }

    const peerUserId = extractGramPeerUserId(update.peer);
    if (!peerUserId) {
      return;
    }

    const row = await this.findPersistedTelegramMessageForReaction(
      integration,
      msgId,
      peerUserId,
    );
    if (!row) {
      this.log.debug(
        `Telegram reaction skipped: message not in DB msg_id=${msgId} peer=${peerUserId} integration_id=${integration.id}`,
      );
      return;
    }

    const conv = await this.conversationRepo.findOne({
      where: { id: row.conversationId },
    });
    if (
      !conv ||
      conv.source !== ConversationSource.TELEGRAM ||
      conv.externalSourceId !== String(integration.id)
    ) {
      return;
    }

    const reactions = this.buildStoredReactionsFromTelegram(
      update.reactions,
      row.senderId,
      row.receiverId,
      integration.telegramUserId?.trim() ?? "",
    );
    if (reactions.length === 0) {
      const payload = update.reactions;
      const recentCount =
        payload && typeof payload === "object" && "recentReactions" in payload
          ? ((payload as { recentReactions?: unknown[] }).recentReactions
              ?.length ?? 0)
          : 0;
      const resultCount =
        payload && typeof payload === "object" && "results" in payload
          ? ((payload as { results?: unknown[] }).results?.length ?? 0)
          : 0;
      this.log.warn(
        `Telegram reaction update empty id=${row.externalId} integration_id=${integration.id} recent=${recentCount} results=${resultCount}`,
      );
    }
    row.reactionsJson = serializeReactionsJson(reactions);
    const saved = await this.conversationMessageRepo.save(row);
    this.log.debug(
      `Updated telegram reactions from update id=${row.externalId} conversation_id=${conv.id} count=${reactions.length}`,
    );
    await this.messageNotify.notifyPersistedMessage(saved, integration.ownerId);
  }

  async persistNewMessageEvent(
    integration: TelegramIntegration,
    event: NewMessageEvent,
    connectedClient?: TelegramClient,
  ): Promise<void> {
    const msg = event.message;
    if (!msg?.id) {
      return;
    }

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

    await this.persistPrivateMessage(integration, msg, chatId, connectedClient);
  }

  /**
   * Backfill recent private messages after reconnect/deploy (deduped by external_id).
   * Does not run status workflow (especially new → processing on outbound history).
   */
  async catchUpRecentPrivateMessages(
    integration: TelegramIntegration,
    client: TelegramClient,
  ): Promise<number> {
    const catchUpSinceUnix = Math.floor(
      (Date.now() - TelegramMessagePersistenceService.CATCHUP_WINDOW_MS) / 1000,
    );
    let saved = 0;

    try {
      const dialogs = await client.getDialogs({
        limit: TelegramMessagePersistenceService.CATCHUP_MAX_DIALOGS,
      });

      for (const dialog of dialogs) {
        const entity = dialog.entity;
        if (!(entity instanceof Api.User) || entity instanceof Api.UserEmpty) {
          continue;
        }

        const chatId = utils.getPeerId(entity);
        let messages: Api.Message[];
        try {
          messages = await client.getMessages(entity, {
            limit:
              TelegramMessagePersistenceService.CATCHUP_MESSAGES_PER_DIALOG,
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.log.debug(
            `Telegram catch-up getMessages failed integration_id=${integration.id} chat_id=${chatId}: ${err}`,
          );
          continue;
        }

        for (const msg of messages) {
          if (!msg?.id) {
            continue;
          }
          if (typeof msg.date === "number" && msg.date < catchUpSinceUnix) {
            continue;
          }
          const isNew = await this.persistPrivateMessage(
            integration,
            msg,
            chatId,
            client,
            { isCatchUp: true },
          );
          if (isNew) {
            saved += 1;
          }
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Telegram catch-up failed integration_id=${integration.id}: ${err}`,
      );
    }

    return saved;
  }

  /** @returns true when a new row was inserted */
  private async persistPrivateMessage(
    integration: TelegramIntegration,
    msg: Api.Message,
    chatId: string,
    connectedClient?: TelegramClient,
    options?: { isCatchUp?: boolean },
  ): Promise<boolean> {
    if (!msg.id) {
      return false;
    }

    const ownerId = integration.ownerId;
    const myUserId = integration.telegramUserId?.trim();
    if (!myUserId) {
      return false;
    }

    const {
      participantId,
      senderId: effectiveSenderId,
      receiverId,
      isOutgoing,
    } = this.resolvePrivateMessageActors(msg, chatId, myUserId);

    const messageDate =
      typeof msg.date === "number" ? new Date(msg.date * 1000) : new Date();
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
      await this.conversationWorkflow.onConversationCreated(conv, ownerId);
      await this.chatAutoDistribution.tryAssignOnNewConversation(conv);
    } else if (
      !isOutgoing &&
      (await this.conversationWorkflow.shouldDropInboundMessage(conv))
    ) {
      this.log.debug(
        `Dropped inbound telegram message for spam conversation id=${conv.id} external_id=${externalMessageId}`,
      );
      return false;
    } else if (conv.instUpdatedAt.getTime() < messageDate.getTime()) {
      conv.instUpdatedAt = messageDate;
      await this.conversationRepo.save(conv);
    }

    const { text, attachments, rawExtras, storedAttachments, messageType } =
      await this.resolvePrivateMessageContent(
        msg,
        chatId,
        participantId,
        connectedClient,
        {
          conversationId: conv.id,
          messageExternalId: externalMessageId,
          messageAt: messageDate,
        },
      );

    await this.syncParticipantOnPersist(
      integration,
      participantId,
      connectedClient,
    );
    const sharedPhone =
      typeof rawExtras.phone === "string" ? rawExtras.phone : null;
    if (sharedPhone) {
      await this.telegramUsers.upsertParticipantPhone(
        integration.workspaceId,
        participantId,
        sharedPhone,
      );
    }

    const existing = await this.conversationMessageRepo.findOne({
      where: { externalId: externalMessageId },
    });
    if (existing) {
      return false;
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
        attachments,
        raw: {
          peerId: chatId,
          out: msg.out ?? isOutgoing,
          ...rawExtras,
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
      reactionsJson: serializeReactionsJson(
        this.buildStoredReactionsFromTelegram(
          msg.reactions,
          effectiveSenderId,
          receiverId,
          myUserId,
        ),
      ),
      attachmentJson: serializeAttachmentsJson(storedAttachments),
      messageType,
    });

    const saved = await this.conversationMessageRepo.save(row);
    if (!options?.isCatchUp) {
      await this.messageNotify.notifyPersistedMessage(saved, ownerId);
      if (!isOutgoing) {
        await this.conversationWorkflow.onInboundCustomerMessage(conv);
      }
    }

    // new → processing is only via system API (persistOutboundMessage) or assign responsible.

    this.log.debug(
      `Saved telegram message id=${externalMessageId} conversation_id=${conv.id} integration_id=${integration.id}`,
    );
    return true;
  }

  private static readonly CATCHUP_WINDOW_MS = 1 * 60 * 60 * 1000;
  private static readonly CATCHUP_MAX_DIALOGS = 100;
  private static readonly CATCHUP_MESSAGES_PER_DIALOG = 30;

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
    messageType?: ConversationMessageType;
    storedAttachments?: StoredMessageAttachment[];
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
      storedAttachments = [],
      messageType = storedAttachments.length > 0
        ? resolveMessageTypeFromAttachments(storedAttachments)
        : ConversationMessageType.text,
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
        attachments: this.buildLegacyAttachmentsFromStored(storedAttachments),
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
      attachmentJson: serializeAttachmentsJson(storedAttachments),
      messageType,
    });

    const saved = await this.conversationMessageRepo.save(row);
    await this.messageNotify.notifyPersistedMessage(saved, ownerId);
    await this.conversationWorkflow.onOutboundAgentReply(conversation);
    return saved;
  }

  /**
   * Participant read our outbound messages up to `maxId` (Telegram UpdateReadHistoryOutbox).
   * Sets `conversation_messages.read_at` only — does not touch `conversations.read_at`.
   */
  async persistOutboxReadReceipt(
    integration: TelegramIntegration,
    update: Api.UpdateReadHistoryOutbox,
  ): Promise<void> {
    const myUserId = integration.telegramUserId?.trim();
    if (!myUserId) {
      return;
    }

    if (!(update.peer instanceof Api.PeerUser)) {
      return;
    }

    const maxId = Number(update.maxId);
    if (!Number.isInteger(maxId) || maxId <= 0) {
      return;
    }

    const chatId = this.resolvePeerUserId(update.peer);
    if (!chatId) {
      return;
    }

    const conv = await this.conversationRepo.findOne({
      where: {
        workspaceId: integration.workspaceId,
        source: ConversationSource.TELEGRAM,
        externalSourceId: String(integration.id),
        participantId: chatId,
      },
      order: { id: "DESC" },
    });
    if (!conv) {
      return;
    }

    const readAt = new Date();
    const result = await this.conversationMessageRepo
      .createQueryBuilder()
      .update(ConversationMessage)
      .set({ readAt })
      .where("conversation_id = :conversationId", { conversationId: conv.id })
      .andWhere("sender_id = :myUserId", { myUserId })
      .andWhere("read_at IS NULL")
      .andWhere("external_id LIKE :externalIdPrefix", {
        externalIdPrefix: `tg:${chatId}:%`,
      })
      .andWhere("CAST(SPLIT_PART(external_id, ':', 3) AS INTEGER) <= :maxId", {
        maxId,
      })
      .execute();

    const affected = result.affected ?? 0;
    if (affected === 0) {
      return;
    }

    await this.messageNotify.notifyConversationForOwner(
      integration.ownerId,
      conv.id,
    );

    this.log.debug(
      `Telegram outbox read receipt chat_id=${chatId} max_id=${maxId} messages_updated=${affected} conversation_id=${conv.id}`,
    );
  }

  private resolvePeerUserId(peer: Api.PeerUser): string {
    try {
      return utils.getPeerId(peer);
    } catch {
      return this.bigIntToId(peer.userId);
    }
  }

  private async ensureConversation(params: {
    integration: TelegramIntegration;
    ownerId: number;
    participantId: string;
    externalConversationId: string;
    messageDate: Date;
  }): Promise<{ conv: Conversation; convSaved: boolean }> {
    const { integration, participantId, externalConversationId, messageDate } =
      params;

    let row = await this.conversationRepo.findOne({
      where: {
        workspaceId: integration.workspaceId,
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
        workspaceId: integration.workspaceId,
        externalId: externalConversationId,
      },
    });
    if (row) {
      return { conv: row, convSaved: false };
    }

    row = this.conversationRepo.create({
      externalSourceId: String(integration.id),
      externalId: externalConversationId,
      createdAt: new Date(),
      instUpdatedAt: messageDate,
      readAt: null,
      participantId,
      source: ConversationSource.TELEGRAM,
      workspaceId: integration.workspaceId,
      groupId: null,
    });
    return { conv: row, convSaved: true };
  }

  private async resolvePrivateMessageContent(
    msg: Api.Message,
    chatId: string,
    participantId: string,
    connectedClient?: TelegramClient,
    archiveContext?: {
      conversationId: number;
      messageExternalId: string;
      messageAt: Date;
    },
  ): Promise<{
    text: string;
    attachments?: { data: Array<Record<string, unknown>> };
    rawExtras: Record<string, unknown>;
    storedAttachments: StoredMessageAttachment[];
    messageType: ConversationMessageType;
  }> {
    if (connectedClient && archiveContext) {
      const archivedMedia = await this.mediaArchive.archiveTelegramMedia(
        connectedClient,
        msg,
        chatId,
        archiveContext,
      );
      if (archivedMedia) {
        return {
          text: archivedMedia.displayText,
          attachments: archivedMedia.attachments,
          rawExtras: archivedMedia.rawExtras,
          storedAttachments: archivedMedia.storedAttachments,
          messageType: resolveMessageTypeFromAttachments(
            archivedMedia.storedAttachments,
          ),
        };
      }
    }

    let photoContent = this.extractPhotoContent(msg);
    let cdnUrl: string | null = null;
    let storedAttachments: StoredMessageAttachment[] = [];
    if (photoContent && connectedClient) {
      const uploaded = await this.uploadTelegramPhotoToCdn(
        connectedClient,
        msg,
        chatId,
      );
      if (uploaded) {
        cdnUrl = uploaded.cdnUrl;
        photoContent = this.extractPhotoContent(msg, cdnUrl);
        if (uploaded.cloudflareImageId && archiveContext) {
          storedAttachments = [
            {
              type: "image",
              key: uploaded.cloudflareImageId,
              url: uploaded.cdnUrl,
              at: archiveContext.messageAt.toISOString(),
              name: uploaded.name,
            },
          ];
        }
      }
    }
    const sharedPhone = this.extractParticipantSharedPhone(msg, participantId);
    const rawExtras: Record<string, unknown> = {
      ...(photoContent ? { mediaType: "photo" } : {}),
      ...(sharedPhone ? { mediaType: "contact", phone: sharedPhone } : {}),
      ...(cdnUrl ? { cdnUrl } : {}),
    };
    const text =
      sharedPhone != null
        ? sharedPhone
        : photoContent
          ? photoContent.displayText
          : (msg.message ?? "").trim() || "[non-text message]";

    return {
      text,
      attachments: photoContent?.attachments,
      rawExtras,
      storedAttachments,
      messageType:
        storedAttachments.length > 0
          ? resolveMessageTypeFromAttachments(storedAttachments)
          : this.resolveTelegramMessageTypeFallback({
              storedAttachments: [],
              hasPhoto: photoContent != null,
              rawExtras,
            }),
    };
  }

  private resolveTelegramMessageTypeFallback(params: {
    storedAttachments: StoredMessageAttachment[];
    hasPhoto: boolean;
    rawExtras: Record<string, unknown>;
  }): ConversationMessageType {
    if (params.storedAttachments.length > 0) {
      return resolveMessageTypeFromAttachments(params.storedAttachments);
    }
    const mediaType = params.rawExtras.mediaType;
    if (params.hasPhoto || mediaType === "photo" || mediaType === "image") {
      return ConversationMessageType.image;
    }
    if (mediaType === "video") {
      return ConversationMessageType.video;
    }
    if (mediaType === "audio") {
      return ConversationMessageType.audio;
    }
    if (mediaType === "file" || mediaType === "files") {
      return ConversationMessageType.file;
    }
    return ConversationMessageType.text;
  }

  private mergeStoredPayload(
    existingJson: string,
    nextPayload: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      const existing = JSON.parse(existingJson) as Record<string, unknown>;
      const existingTelegram =
        existing.telegram && typeof existing.telegram === "object"
          ? (existing.telegram as Record<string, unknown>)
          : {};
      const nextTelegram =
        nextPayload.telegram && typeof nextPayload.telegram === "object"
          ? (nextPayload.telegram as Record<string, unknown>)
          : {};

      return {
        ...existing,
        ...nextPayload,
        telegram: {
          ...existingTelegram,
          ...nextTelegram,
        },
      };
    } catch {
      return nextPayload;
    }
  }

  private async deletePersistedTelegramMessage(
    integration: TelegramIntegration,
    telegramMessageId: number,
    chatId: string | null,
  ): Promise<ConversationMessage[]> {
    const qb = this.conversationMessageRepo
      .createQueryBuilder("m")
      .innerJoin("m.conversation", "c")
      .where("c.workspace_id = :workspaceId", {
        workspaceId: integration.workspaceId,
      })
      .andWhere("c.source = :source", {
        source: ConversationSource.TELEGRAM,
      })
      .andWhere("c.external_source_id = :integrationId", {
        integrationId: String(integration.id),
      });

    if (chatId) {
      qb.andWhere("m.external_id = :externalId", {
        externalId: `tg:${chatId}:${telegramMessageId}`,
      });
    } else {
      qb.andWhere(
        "CAST(SPLIT_PART(m.external_id, ':', 3) AS INTEGER) = :messageId",
        { messageId: telegramMessageId },
      );
    }

    const rows = await qb.getMany();
    if (rows.length === 0) {
      return [];
    }

    const deletedAt = new Date();
    const saved: ConversationMessage[] = [];
    for (const row of rows) {
      if (row.deletedAt == null) {
        row.deletedAt = deletedAt;
      }
      const savedRow = await this.conversationMessageRepo.save(row);
      saved.push(savedRow);
      this.log.debug(
        `Soft-deleted telegram message id=${row.externalId} conversation_id=${row.conversationId} integration_id=${integration.id}`,
      );
    }

    return saved;
  }

  private buildLegacyAttachmentsFromStored(
    stored: StoredMessageAttachment[],
  ): { data: Array<Record<string, unknown>> } | undefined {
    if (stored.length === 0) {
      return undefined;
    }
    return {
      data: stored.map((item) => {
        const attachment: Record<string, unknown> = {
          name: item.name,
          file_url: item.url,
          r2_url: item.url,
        };
        if (item.r2_key) {
          attachment.r2_key = item.r2_key;
        }
        if (item.type === "image") {
          attachment.image_data = { url: item.url };
          attachment.mime_type = "image/jpeg";
        } else if (item.type === "video") {
          attachment.video_data = { url: item.url, preview_url: item.url };
          attachment.mime_type = "video/mp4";
        } else if (item.type === "audio") {
          attachment.mime_type = "audio/ogg";
        }
        return attachment;
      }),
    };
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
      message: text,
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
  ): Promise<{
    cdnUrl: string;
    cloudflareImageId: string;
    name: string;
  } | null> {
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

      const name = `telegram-${chatId}-${msg.id}.jpg`;
      const uploaded = await this.cloudflareImages.uploadImage({
        buffer,
        mimetype: "image/jpeg",
        originalname: name,
      });
      const cloudflareImageId = uploaded.cloudflareImageId?.trim();
      if (!cloudflareImageId) {
        return null;
      }
      return {
        cdnUrl: uploaded.cdnUrl,
        cloudflareImageId,
        name,
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Telegram photo Cloudflare upload failed chat=${chatId}: ${err}`,
      );
      return null;
    }
  }

  private extractParticipantSharedPhone(
    msg: Api.Message,
    participantId: string,
  ): string | null {
    const media = msg.media;
    if (!(media instanceof Api.MessageMediaContact)) {
      return null;
    }

    const phone = TelegramUsersService.normalizePhoneOptional(
      media.phoneNumber,
    );
    if (!phone) {
      return null;
    }

    const contactUserIdRaw =
      media.userId != null ? this.bigIntToId(media.userId) : null;
    const contactUserId =
      contactUserIdRaw && contactUserIdRaw !== "0" ? contactUserIdRaw : null;
    if (contactUserId != null && contactUserId !== participantId) {
      return null;
    }

    return phone;
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
          ? {
              fileReference: Buffer.from(photo.fileReference).toString(
                "base64",
              ),
            }
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
    if (typeof value === "object" && "value" in value) {
      return String((value as { value: bigint }).value);
    }
    return String(value);
  }

  private buildStoredReactionsFromTelegram(
    reactions: Api.TypeMessageReactions | undefined,
    messageSenderId: string,
    messageReceiverId: string,
    myUserId: string,
  ): StoredMessageReaction[] {
    if (!isGramMessageReactions(reactions)) {
      return [];
    }

    const recent = reactions.recentReactions ?? [];
    const out: StoredMessageReaction[] = [];

    for (const item of recent) {
      if (!isGramMessagePeerReaction(item)) {
        continue;
      }
      const reaction = extractGramReactionEmoticon(item.reaction);
      if (!reaction) {
        continue;
      }
      const reactorUserId = extractGramPeerUserId(item.peerId);
      let from = reactorUserId
        ? this.resolveReactionFromParticipant(
            reactorUserId,
            messageSenderId,
            messageReceiverId,
          )
        : null;
      if (!from) {
        from = this.resolveReactionFromMyFlag(
          item,
          messageSenderId,
          messageReceiverId,
          myUserId,
        );
      }
      if (!from) {
        continue;
      }
      const at =
        typeof item.date === "number"
          ? new Date(item.date * 1000).toISOString()
          : new Date().toISOString();
      out.push({ reaction, at, from });
    }

    if (out.length > 0) {
      return this.dedupeStoredReactions(out);
    }

    // Telegram frequently sends only aggregate counts. In private chats there
    // are only two possible reactors, so `chosenOrder` lets us keep useful
    // sender/receiver semantics even when `recentReactions` is unavailable.
    return this.buildStoredReactionsFromTelegramCounts(
      reactions.results ?? [],
      messageSenderId,
      messageReceiverId,
      myUserId,
    );
  }

  private async findPersistedTelegramMessageForReaction(
    integration: TelegramIntegration,
    telegramMessageId: number,
    peerUserId: string,
  ): Promise<ConversationMessage | null> {
    const exactExternalId = `tg:${peerUserId}:${telegramMessageId}`;
    const exact = await this.conversationMessageRepo
      .createQueryBuilder("m")
      .innerJoin("m.conversation", "c")
      .where("m.external_id = :externalId", { externalId: exactExternalId })
      .andWhere("c.workspace_id = :workspaceId", {
        workspaceId: integration.workspaceId,
      })
      .andWhere("c.source = :source", { source: ConversationSource.TELEGRAM })
      .andWhere("c.external_source_id = :integrationId", {
        integrationId: String(integration.id),
      })
      .getOne();
    if (exact) {
      return exact;
    }

    const qb = this.conversationMessageRepo
      .createQueryBuilder("m")
      .innerJoin("m.conversation", "c")
      .where("c.workspace_id = :workspaceId", {
        workspaceId: integration.workspaceId,
      })
      .andWhere("c.source = :source", { source: ConversationSource.TELEGRAM })
      .andWhere("c.external_source_id = :integrationId", {
        integrationId: String(integration.id),
      })
      .andWhere(
        "CAST(SPLIT_PART(m.external_id, ':', 3) AS INTEGER) = :messageId",
        { messageId: telegramMessageId },
      )
      .andWhere(
        "(c.participant_id = :peerUserId OR SPLIT_PART(m.external_id, ':', 2) = :peerUserId)",
        { peerUserId },
      );

    return (
      qb.getOne() ??
      this.findPersistedTelegramMessageByTelegramIdOnly(
        integration,
        telegramMessageId,
      )
    );
  }

  private async findPersistedTelegramMessageByTelegramIdOnly(
    integration: TelegramIntegration,
    telegramMessageId: number,
  ): Promise<ConversationMessage | null> {
    return this.conversationMessageRepo
      .createQueryBuilder("m")
      .innerJoin("m.conversation", "c")
      .where("c.workspace_id = :workspaceId", {
        workspaceId: integration.workspaceId,
      })
      .andWhere("c.source = :source", { source: ConversationSource.TELEGRAM })
      .andWhere("c.external_source_id = :integrationId", {
        integrationId: String(integration.id),
      })
      .andWhere(
        "CAST(SPLIT_PART(m.external_id, ':', 3) AS INTEGER) = :messageId",
        { messageId: telegramMessageId },
      )
      .orderBy("m.created_at", "DESC")
      .getOne();
  }

  private buildStoredReactionsFromTelegramCounts(
    results: Api.TypeReactionCount[],
    messageSenderId: string,
    messageReceiverId: string,
    myUserId: string,
  ): StoredMessageReaction[] {
    const myRole = this.resolveReactionFromParticipant(
      myUserId,
      messageSenderId,
      messageReceiverId,
    );
    const otherRole =
      myRole === "sender"
        ? "receiver"
        : myRole === "receiver"
          ? "sender"
          : null;
    const at = new Date().toISOString();
    const out: StoredMessageReaction[] = [];

    for (const item of results) {
      if (!isGramReactionCount(item)) {
        continue;
      }
      const reaction = extractGramReactionEmoticon(item.reaction);
      if (!reaction) {
        continue;
      }
      const count = Number(item.count ?? 0);
      if (!Number.isFinite(count) || count <= 0) {
        continue;
      }

      const selfReacted = item.chosenOrder != null && myRole != null;
      if (selfReacted && myRole) {
        out.push({ reaction, at, from: myRole });
      }

      const remaining = count - (selfReacted ? 1 : 0);
      if (remaining > 0 && otherRole) {
        out.push({ reaction, at, from: otherRole });
      }
    }

    return this.dedupeStoredReactions(out);
  }

  private dedupeStoredReactions(
    reactions: StoredMessageReaction[],
  ): StoredMessageReaction[] {
    const seen = new Set<string>();
    return reactions.filter((item) => {
      const key = `${item.from}:${item.reaction}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private resolveTelegramReactionEmoticon(
    reaction: Api.TypeReaction | undefined,
  ): string | null {
    if (reaction instanceof Api.ReactionEmoji) {
      const emoticon = reaction.emoticon?.trim();
      return emoticon || null;
    }
    if (reaction instanceof Api.ReactionCustomEmoji) {
      return `custom:${this.bigIntToId(reaction.documentId)}`;
    }
    if (reaction instanceof Api.ReactionPaid) {
      return "paid";
    }
    return null;
  }

  private resolveUserIdFromPeer(peer: Api.TypePeer | undefined): string | null {
    if (!peer) {
      return null;
    }
    try {
      return utils.getPeerId(peer);
    } catch {
      if (peer instanceof Api.PeerUser) {
        return this.bigIntToId(peer.userId);
      }
      return null;
    }
  }

  private resolveReactionFromMyFlag(
    item: Api.MessagePeerReaction,
    messageSenderId: string,
    messageReceiverId: string,
    myUserId: string,
  ): "sender" | "receiver" | null {
    const myRole = this.resolveReactionFromParticipant(
      myUserId,
      messageSenderId,
      messageReceiverId,
    );
    if (!myRole) {
      return null;
    }
    const otherRole = myRole === "sender" ? "receiver" : "sender";
    if (item.my === true) {
      return myRole;
    }
    if (item.my === false) {
      return otherRole;
    }
    return null;
  }

  private resolveReactionFromParticipant(
    reactorUserId: string,
    messageSenderId: string,
    messageReceiverId: string,
  ): "sender" | "receiver" | null {
    const reactor = reactorUserId.trim();
    const sender = messageSenderId.trim();
    const receiver = messageReceiverId.trim();
    if (reactor && reactor === sender) {
      return "sender";
    }
    if (reactor && reactor === receiver) {
      return "receiver";
    }
    return null;
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
