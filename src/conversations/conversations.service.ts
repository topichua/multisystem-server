import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, In, Repository } from "typeorm";
import {
  InstagramIntegration,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  ConversationSource,
  InstagramUser,
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import type {
  InstagramConversationDto,
  InstagramConversationParticipantDto,
  InstagramConversationsResponseDto,
} from "./dto/http/instagram-conversations-response.dto";
import type {
  InstagramMessageDto,
  InstagramMessagesResponseDto,
} from "./dto/http/instagram-messages-response.dto";
import { ConversationMessageNotifyService } from "./conversation-message-notify.service";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { mergeMessageJsonPreservingReactions } from "./instagram-message-reactions.util";
import { INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS } from "./instagram-graph-message-fields";
import type { SendInstagramMessageResponseDto } from "./dto/http/send-instagram-message-response.dto";
import {
  TELEGRAM_CONVERSATION_MESSAGING,
  type TelegramConversationMessagingPort,
} from "../telegram-integrations/telegram-integrations.tokens";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type {
  ConversationRowDto,
  ConversationParticipantDto,
} from "./dto/http/conversations-list-response.dto";
type InstagramErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

@Injectable()
export class ConversationsService {
  private readonly log = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationGroup)
    private readonly conversationGroupRepo: Repository<ConversationGroup>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
    @InjectRepository(TelegramIntegration)
    private readonly telegramIntegrationRepo: Repository<TelegramIntegration>,
    private readonly messagePresenter: ConversationMessagePresenterService,
    @Inject(forwardRef(() => ConversationMessageNotifyService))
    private readonly messageNotify: ConversationMessageNotifyService,
    @Inject(TELEGRAM_CONVERSATION_MESSAGING)
    private readonly telegramMessaging: TelegramConversationMessagingPort,
  ) {}

  async listConversationsForOwner(
    ownerId: number,
    filters?: { groupIds?: number[] },
  ): Promise<{
    items: ConversationRowDto[];
  }> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const myAccountIds = await this.buildMyAccountIds(ownerId, integration);

    const groupIds = filters?.groupIds?.filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    let where: FindOptionsWhere<Conversation> = { managerId: ownerId };
    if (groupIds != null && groupIds.length > 0) {
      const unique = [...new Set(groupIds)];
      const groups = await this.conversationGroupRepo.find({
        where: { workspaceId: integration.workspaceId, id: In(unique) },
      });
      const found = new Set(groups.map((g) => g.id));
      const missing = unique.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Unknown or inaccessible group id(s) for this workspace: ${missing.join(", ")}`,
        );
      }
      where = { managerId: ownerId, groupId: In(unique) };
    }

    const rows = await this.conversationRepo.find({
      where,
      order: { instUpdatedAt: "DESC" },
    });
    const lastMessageByConversationId =
      await this.getLastMessageByConversationIds(rows.map((r) => r.id));
    const participantById = await this.getInstagramUsersByIds(
      rows.map((r) => r.participantId),
    );

    return {
      items: rows.map((r) =>
        this.toConversationRowDto(
          r,
          lastMessageByConversationId.get(r.id),
          participantById,
          myAccountIds,
        ),
      ),
    };
  }

  /**
   * Pulls the Instagram conversation list for the company page and upserts `conversations` rows
   * for the current owner as `manager_id`.
   */
  async syncInstagramConversationsForOwner(
    ownerId: number,
  ): Promise<{ upserted: number }> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const pageId = integration.pageId?.trim();
    if (!pageId || pageId === "pending") {
      throw new BadRequestException(
        "InstagramIntegration Instagram / Facebook page id is not configured; set page_id before sync.",
      );
    }
    const token = await this.resolveGraphAccessToken(integration.id);
    const conversations = await this.fetchAllInstagramConversations(
      pageId,
      token,
    );
    await this.enrichParticipantProfilePics(
      { data: conversations, paging: undefined },
      token,
    );

    let upserted = 0;
    for (const ig of conversations) {
      const externalId = ig.id?.trim();
      if (!externalId) continue;
      const participantId = this.pickCustomerParticipantId(
        ig.participants?.data ?? [],
        pageId,
      );
      const instUpdatedAt = new Date(ig.updated_time);
      if (Number.isNaN(instUpdatedAt.getTime())) continue;

      let row = await this.conversationRepo.findOne({
        where: { managerId: ownerId, externalId },
      });
      if (!row) {
        row = this.conversationRepo.create({
          externalSourceId: pageId,
          externalId,
          instUpdatedAt,
          readAt: null,
          participantId,
          source: ConversationSource.INSTAGRAM,
          managerId: ownerId,
          groupId: null,
        });
      } else {
        row.instUpdatedAt = instUpdatedAt;
        row.participantId = participantId;
        row.externalSourceId = pageId;
      }
      await this.conversationRepo.save(row);
      upserted++;
    }
    return { upserted };
  }

  /**
   * GET `/v25.0/{message-id}?fields=…` — reusable for webhook allocation and tooling.
   */
  async fetchInstagramMessageById(
    messageId: string,
    accessToken: string,
    fields = "id,created_time,from,to,message",
  ): Promise<InstagramMessageDto> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(messageId)}`,
    );
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);
    return this.instagramGraphFetch<InstagramMessageDto>(url);
  }

  /**
   * GET `/v25.0/{page-id}/conversations?platform=instagram&user_id=…` — reusable Graph helper.
   */
  async fetchInstagramConversationsForUser(
    pageId: string,
    userId: string,
    accessToken: string,
  ): Promise<InstagramConversationDto[]> {
    const out: InstagramConversationDto[] = [];
    const fields = encodeURIComponent("id,participants,updated_time");
    let nextUrl: string | null =
      `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/conversations` +
      `?platform=instagram&user_id=${encodeURIComponent(userId)}&fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

    while (nextUrl) {
      const batch: InstagramConversationsResponseDto =
        await this.instagramGraphFetch<InstagramConversationsResponseDto>(
          new URL(nextUrl),
        );
      out.push(...(batch.data ?? []));
      nextUrl = batch.paging?.next ?? null;
    }
    return out;
  }

  async getConversationForOwnerById(
    ownerId: number,
    id: number,
  ): Promise<ConversationRowDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const row = await this.conversationRepo.findOne({
      where: { id, managerId: ownerId },
    });
    if (!row) {
      throw new NotFoundException("Conversation not found");
    }
    const myAccountIds = await this.buildMyAccountIds(ownerId, integration, row);
    const lastMessageByConversationId =
      await this.getLastMessageByConversationIds([row.id]);
    const participantById = await this.getInstagramUsersByIds([
      row.participantId,
    ]);
    return this.toConversationRowDto(
      row,
      lastMessageByConversationId.get(row.id),
      participantById,
      myAccountIds,
    );
  }

  /**
   * Sets `conversations.group_id` to a group in the same workspace as the owner’s integration.
   */
  async assignConversationGroupForOwner(
    ownerId: number,
    conversationId: number,
    groupId: number,
  ): Promise<ConversationRowDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;

    const conv = await this.conversationRepo.findOne({
      where: { id: conversationId, managerId: ownerId },
    });
    if (!conv) {
      throw new NotFoundException("Conversation not found");
    }

    const group = await this.conversationGroupRepo.findOne({
      where: { id: groupId, workspaceId },
    });
    if (!group) {
      throw new BadRequestException(
        "Conversation group not found or does not belong to this workspace",
      );
    }

    conv.groupId = groupId;
    await this.conversationRepo.save(conv);

    return this.getConversationForOwnerById(ownerId, conversationId);
  }

  private toConversationRowDto(
    row: Conversation,
    lastMessage: ConversationMessage | undefined,
    participantById: Map<string, InstagramUser>,
    myAccountIds: Set<string>,
  ): ConversationRowDto {
    const participant = this.toConversationParticipantDto(
      row.participantId,
      participantById,
      row.source,
    );
    const isLastMessageFromMe = this.resolveIsLastMessageFromMe(
      lastMessage,
      myAccountIds,
    );
    return {
      id: row.id,
      instUpdatedAt: row.instUpdatedAt,
      isUnread: this.resolveConversationIsUnread(
        row,
        lastMessage,
        isLastMessageFromMe,
      ),
      source: row.source,
      groupId: row.groupId,
      lastMessage: lastMessage?.message ?? "",
      isLastMessageFromMe,
      participant,
    };
  }

  /**
   * Unread when the latest message is from the participant (not my account) and it is
   * newer than when this user last opened the thread (`conversations.read_at`), or
   * they have never opened it (`read_at` null).
   */
  private resolveConversationIsUnread(
    row: Conversation,
    lastMessage: ConversationMessage | undefined,
    isLastMessageFromMe: boolean | null,
  ): boolean {
    if (!lastMessage) return false;
    if (isLastMessageFromMe !== false) return false;
    const lastTs = lastMessage.createdAt.getTime();
    const readTs = row.readAt?.getTime();
    if (readTs == null) return true;
    return lastTs > readTs;
  }

  private resolveIsLastMessageFromMe(
    lastMessage: ConversationMessage | undefined,
    myAccountIds: Set<string>,
  ): boolean | null {
    if (!lastMessage) return null;
    const senderId = lastMessage.senderId?.trim();
    if (!senderId || senderId === "0") return null;
    return myAccountIds.has(senderId);
  }

  private buildMyInstagramIds(company: InstagramIntegration): Set<string> {
    return new Set(
      [company.instagramAccountId, company.pageId]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );
  }

  private async buildMyAccountIds(
    ownerId: number,
    company: InstagramIntegration,
    conversation?: Conversation,
  ): Promise<Set<string>> {
    const ids = this.buildMyInstagramIds(company);
    const integrations = await this.telegramIntegrationRepo.find({
      where: { ownerId, status: TelegramIntegrationStatus.ACTIVE },
    });
    for (const row of integrations) {
      const telegramUserId = row.telegramUserId?.trim();
      if (telegramUserId) {
        ids.add(telegramUserId);
      }
    }
    if (
      conversation?.source === ConversationSource.TELEGRAM &&
      conversation.externalSourceId
    ) {
      const integrationId = Number.parseInt(
        conversation.externalSourceId.trim(),
        10,
      );
      if (Number.isInteger(integrationId) && integrationId > 0) {
        const linked = integrations.find((i) => i.id === integrationId);
        const linkedUserId = linked?.telegramUserId?.trim();
        if (linkedUserId) {
          ids.add(linkedUserId);
        }
      }
    }
    return ids;
  }

  private toConversationParticipantDto(
    participantId: string | undefined,
    participantById: Map<string, InstagramUser>,
    source: ConversationSource,
  ): ConversationParticipantDto | null {
    if (source === ConversationSource.TELEGRAM) {
      return this.emptyTelegramParticipant();
    }
    const participantKey = participantId?.trim();
    if (!participantKey || participantKey === "unknown") return null;
    const participant = participantById.get(participantKey);
    if (!participant) return null;
    return {
      id: participant.id,
      name: participant.name,
      username: participant.username,
      profilePic: participant.profilePic,
    };
  }

  private emptyTelegramParticipant(): ConversationParticipantDto {
    return {
      id: "",
      name: "",
      username: "",
      profilePic: "",
    };
  }

  private async getInstagramUsersByIds(
    ids: string[],
  ): Promise<Map<string, InstagramUser>> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) return new Map();
    const users = await this.instagramUserRepo.find({
      where: { id: In(uniqIds) },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  private async getLastMessageByConversationIds(
    conversationIds: number[],
  ): Promise<Map<number, ConversationMessage>> {
    const uniqIds = [...new Set(conversationIds)];
    if (uniqIds.length === 0) return new Map();

    const rows = await this.conversationMessageRepo
      .createQueryBuilder("m")
      .where("m.conversation_id IN (:...conversationIds)", {
        conversationIds: uniqIds,
      })
      .orderBy("m.conversation_id", "ASC")
      .addOrderBy("m.created_at", "DESC")
      .addOrderBy("m.external_id", "DESC")
      .getMany();

    const out = new Map<number, ConversationMessage>();
    for (const m of rows) {
      if (!out.has(m.conversationId)) {
        out.set(m.conversationId, m);
      }
    }
    return out;
  }

  /**
   * Path `conversationId`: numeric = DB primary key, otherwise stored Instagram `external_id`.
   */
  private async requireConversationForOwnerFromParam(
    ownerId: number,
    conversationIdParam: string,
  ): Promise<Conversation> {
    const trimmed = conversationIdParam.trim();
    if (!trimmed) {
      throw new BadRequestException("conversationId must not be empty");
    }
    if (/^\d+$/.test(trimmed)) {
      const id = Number(trimmed);
      const byPk = await this.conversationRepo.findOne({
        where: { id, managerId: ownerId },
      });
      if (byPk) return byPk;
    }
    const byExternal = await this.conversationRepo.findOne({
      where: { externalId: trimmed, managerId: ownerId },
    });
    if (byExternal) return byExternal;
    throw new NotFoundException("Conversation not found");
  }

  private buildConversationMessagesGraphUrl(
    graphConversationId: string,
    accessToken: string,
    sinceUnixSeconds?: number,
  ): URL {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(graphConversationId)}/messages`,
    );
    url.searchParams.set(
      "fields",
      [
        "id",
        "created_time",
        "message",
        "is_unsupported",
        "from{id,name,email,username}",
        "to{data{id,name,email,username}}",
        `attachments{${INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS}}`,
        "reactions{data{reaction,emoji,users{id,username}}}",
      ].join(","),
    );
    url.searchParams.set("access_token", accessToken);
    if (sinceUnixSeconds != null && Number.isFinite(sinceUnixSeconds)) {
      url.searchParams.set("since", String(Math.floor(sinceUnixSeconds)));
    }
    return url;
  }

  /**
   * Walks `paging.next` up to `maxPages`, keeps messages with `created_time >= since`, deduped by id.
   * Graph often ignores the `since` query param on this edge; client-side filtering is reliable.
   */
  private async getInstagramMessagesSince(
    graphConversationId: string,
    accessToken: string,
    since: Date,
    maxPages = 25,
  ): Promise<InstagramMessagesResponseDto> {
    const sinceMs = since.getTime();
    const firstUrl = this.buildConversationMessagesGraphUrl(
      graphConversationId,
      accessToken,
      Math.floor(sinceMs / 1000),
    );

    const byId = new Map<string, InstagramMessageDto>();
    let nextUrl: string | null = firstUrl.toString();
    let pages = 0;

    while (nextUrl && pages < maxPages) {
      const page: InstagramMessagesResponseDto =
        await this.instagramGraphFetch<InstagramMessagesResponseDto>(
          new URL(nextUrl),
        );
      pages++;
      const batch = page.data ?? [];
      for (const m of batch) {
        const t = new Date(m.created_time).getTime();
        if (!Number.isNaN(t) && t >= sinceMs && m.id) {
          byId.set(m.id, m);
        }
      }
      nextUrl = page.paging?.next ?? null;
    }

    const merged = [...byId.values()].sort(
      (a, b) =>
        new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
    );

    return { data: merged };
  }

  private async persistInstagramMessages(
    conversationDbId: number,
    messages: InstagramMessageDto[],
    options?: { editedAt?: Date; ownerId: number },
  ): Promise<void> {
    for (const m of messages) {
      const ext = m.id?.trim();
      if (!ext) continue;
      const createdAt = new Date(m.created_time);
      if (Number.isNaN(createdAt.getTime())) continue;
      const senderId = m.from?.id?.trim() ?? "";
      const receiverId = m.to?.data?.[0]?.id?.trim() ?? "";
      const text = m.message ?? "";
      const { id, ...messageWithoutId } = m;
      void id;

      let row = await this.conversationMessageRepo.findOne({
        where: { conversationId: conversationDbId, externalId: ext },
      });
      const payloadForJson = row
        ? mergeMessageJsonPreservingReactions(
            row.instagramJson,
            messageWithoutId as Record<string, unknown>,
          )
        : (messageWithoutId as Record<string, unknown>);
      const instagramJson = JSON.stringify(payloadForJson);

      if (!row) {
        row = this.conversationMessageRepo.create({
          conversationId: conversationDbId,
          externalId: ext,
          message: text,
          instagramJson,
          createdAt,
          senderId: senderId.length > 0 ? senderId : "0",
          receiverId: receiverId.length > 0 ? receiverId : "0",
          readAt: null,
          repliedToExternalId: null,
          ...(options?.editedAt != null ? { editedAt: options.editedAt } : {}),
        });
      } else {
        row.message = text;
        row.instagramJson = instagramJson;
        row.createdAt = createdAt;
        row.senderId = senderId.length > 0 ? senderId : row.senderId;
        row.receiverId = receiverId.length > 0 ? receiverId : row.receiverId;
        if (options?.editedAt != null) {
          row.editedAt = options.editedAt;
        }
      }
      const saved = await this.conversationMessageRepo.save(row);
      if (options?.ownerId != null) {
        await this.messageNotify.notifyPersistedMessage(saved, options.ownerId);
      }
    }
  }

  /** Upserts `instagram_users` from message actors + optional conversation participants (Graph profile fields). */
  private async syncInstagramUsersForWebhookAllocation(
    msg: InstagramMessageDto,
    participantExtras: InstagramConversationParticipantDto[] | undefined,
    accessToken: string,
    traceId: string,
    /** e.g. user who sent a reaction (from webhook `sender`) */
    webhookSenderHintId?: string | null,
  ): Promise<void> {
    const t = `[webhook trace=${traceId}]`;
    const ids = new Set<string>();
    const take = (id: string | undefined) => {
      const x = id?.trim();
      if (x && this.isLikelyInstagramPsid(x)) ids.add(x);
    };
    take(msg.from?.id);
    for (const u of msg.to?.data ?? []) take(u.id);
    for (const p of participantExtras ?? []) take(p.id);
    take(webhookSenderHintId ?? undefined);
    for (const item of msg.reactions?.data ?? []) {
      const users = (item as { users?: Array<{ id?: string }> }).users;
      for (const u of users ?? []) take(u.id);
    }

    for (const instagramUserId of ids) {
      try {
        await this.upsertInstagramUserFromGraph(instagramUserId, accessToken);
        this.log.debug(`${t} instagram_users upserted id=${instagramUserId}`);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `${t} instagram_users upsert failed id=${instagramUserId}: ${err}`,
        );
      }
    }
  }

  private async upsertInstagramUserFromGraph(
    instagramUserId: string,
    accessToken: string,
  ): Promise<void> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(instagramUserId)}`,
    );
    url.searchParams.set("access_token", accessToken);
    const node = await this.instagramGraphFetch<{
      id?: string;
      name?: string;
      username?: string;
      profile_pic?: string;
    }>(url);

    const name =
      node.name?.trim() ||
      node.username?.trim() ||
      node.id?.trim() ||
      instagramUserId;
    const username =
      node.username?.trim() || node.id?.trim() || instagramUserId;
    const profilePic = node.profile_pic?.trim() || "";
    const now = new Date();

    let row = await this.instagramUserRepo.findOne({
      where: { id: instagramUserId },
    });
    if (!row) {
      row = this.instagramUserRepo.create({
        id: instagramUserId,
        name,
        username,
        profilePic,
        syncedAt: now,
        lastSeen: now,
      });
    } else {
      row.name = name;
      row.username = username;
      row.profilePic = profilePic;
      row.syncedAt = now;
      row.lastSeen = now;
    }
    await this.instagramUserRepo.save(row);
  }

  private async getConversationMessagesFromDb(
    conversationDbId: number,
    paging?: { page: number; pageSize: number },
  ): Promise<InstagramMessagesResponseDto> {
    const qb = this.conversationMessageRepo
      .createQueryBuilder("m")
      .where("m.conversation_id = :cid", { cid: conversationDbId })
      .orderBy("m.created_at", "DESC")
      .addOrderBy("m.external_id", "DESC");
    const page = paging?.page ?? 1;
    const pageSize = paging?.pageSize ?? 50;
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const messageRowsByExternalId = new Map(rows.map((r) => [r.externalId, r]));
    const parentIds = [
      ...new Set(
        rows
          .map((r) => r.repliedToExternalId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const missingParentIds = parentIds.filter(
      (id) => !messageRowsByExternalId.has(id),
    );
    if (missingParentIds.length > 0) {
      const extraParents = await this.conversationMessageRepo.find({
        where: {
          conversationId: conversationDbId,
          externalId: In(missingParentIds),
        },
      });
      for (const p of extraParents) {
        messageRowsByExternalId.set(p.externalId, p);
      }
    }

    const data: InstagramMessageDto[] = rows.map((r) => {
      const parentId = r.repliedToExternalId?.trim();
      const parent = parentId
        ? messageRowsByExternalId.get(parentId)
        : undefined;
      return this.messagePresenter.mapRowToDto(r, parent);
    });
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      data,
      paging: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: totalPages > 0 && page > 1,
      },
    };
  }

  async getInstagramMessagesForConversation(
    ownerId: number,
    conversationId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<InstagramMessagesResponseDto> {
    const conv = await this.requireConversationForOwnerFromParam(
      ownerId,
      conversationId,
    );
    const result = await this.getConversationMessagesFromDb(conv.id, {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
    });
    return result;
  }

  private normalizeRecipientIdInput(raw: string | undefined | null): string {
    if (raw == null) return "";
    return String(raw)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[\s\u00a0\u200b-\u200d\ufeff,]+/g, "");
  }

  private isLikelyInstagramPsid(id: string | undefined): boolean {
    const t = this.normalizeRecipientIdInput(id ?? "");
    return t.length > 0 && t !== "unknown" && /^\d+$/.test(t);
  }

  /**
   * Sends a message in the conversation thread (Instagram or Telegram).
   * @param replyToId Instagram Graph `mid` or Telegram `tg:{chatId}:{messageId}` from GET .../messages.
   */
  async sendMessageForConversation(
    ownerId: number,
    conversationIdParam: string,
    message: string,
    replyToId?: string,
  ): Promise<SendInstagramMessageResponseDto> {
    const conv = await this.requireConversationForOwnerFromParam(
      ownerId,
      conversationIdParam,
    );
    if (conv.source === ConversationSource.TELEGRAM) {
      return this.telegramMessaging.sendMessageForConversation(
        ownerId,
        conv,
        message,
        replyToId,
      );
    }
    return this.sendInstagramMessageForConversation(
      ownerId,
      conv,
      message,
      replyToId,
    );
  }

  /**
   * @param replyToMid When unset: plain text message. When set: Graph `message.reply_to.mid` (reply).
   */
  async sendInstagramMessageForConversation(
    ownerId: number,
    convOrParam: Conversation | string,
    message: string,
    replyToMid?: string,
  ): Promise<SendInstagramMessageResponseDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const accessToken = integration.accessToken?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        "No Page Graph token: complete Facebook Login so integration.access_token is set.",
      );
    }
    const conv =
      typeof convOrParam === "string"
        ? await this.requireConversationForOwnerFromParam(ownerId, convOrParam)
        : convOrParam;
    if (conv.source !== ConversationSource.INSTAGRAM) {
      throw new BadRequestException("Conversation is not an Instagram thread");
    }

    const recipient = conv.participantId?.trim() ?? "";
    if (!this.isLikelyInstagramPsid(recipient)) {
      throw new BadRequestException(
        "Conversation has no valid participant_id (recipient PSID). Run POST /conversations/sync so the thread is stored with a participant, or open the conversation in Instagram first.",
      );
    }

    const text = message.trim();
    if (!text) {
      throw new BadRequestException("message must not be empty");
    }

    const replyMid = replyToMid?.trim();
    if (replyMid) {
      const parentExists = await this.conversationMessageRepo.exist({
        where: { conversationId: conv.id, externalId: replyMid },
      });
      if (!parentExists) {
        throw new BadRequestException(
          "reply_to_id must be the id of a message in this conversation (from GET .../messages).",
        );
      }
    }

    /** Instagram Messaging: `reply_to` is a root-level sibling of `message`, not inside it. */
    const sendBody: Record<string, unknown> = {
      recipient: { id: recipient },
      message: { text },
      messaging_type: "RESPONSE",
    };
    if (replyMid) {
      sendBody.reply_to = { mid: replyMid };
    }

    const url = new URL("https://graph.facebook.com/v25.0/me/messages");
    url.searchParams.set("access_token", accessToken);

    const result =
      await this.instagramGraphFetch<SendInstagramMessageResponseDto>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
      });

    const maybeError = result as unknown as InstagramErrorResponse;
    if (maybeError.error?.message) {
      throw new BadGatewayException(maybeError.error.message);
    }

    return result;
  }

  private async resolveGraphAccessToken(companyId: number): Promise<string> {
    const integration = await this.instagramIntegrationRepo.findOne({
      where: { id: companyId },
    });
    const pageToken = integration?.accessToken?.trim();
    if (pageToken) return pageToken;

    throw new ServiceUnavailableException(
      "No Page Graph token: complete Facebook Login so integration.access_token is set.",
    );
  }

  private pickCustomerParticipantId(
    participants: InstagramConversationParticipantDto[],
    pageId: string,
  ): string {
    const ids = participants
      .map((p) => p.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return "unknown";
    const page = pageId.trim();
    const notPage = ids.find((id) => id !== page);
    return notPage ?? ids[0];
  }

  private async fetchAllInstagramConversations(
    pageId: string,
    accessToken: string,
  ): Promise<InstagramConversationDto[]> {
    const out: InstagramConversationDto[] = [];
    const fields =
      "id,updated_time,participants{id,name,username,profile_pic},unread_count,message_count";
    let nextUrl: string | null =
      `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/conversations` +
      `?platform=instagram&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;

    while (nextUrl) {
      const page: InstagramConversationsResponseDto =
        await this.instagramGraphFetch<InstagramConversationsResponseDto>(
          new URL(nextUrl),
        );
      out.push(...(page.data ?? []));
      nextUrl = page.paging?.next ?? null;
    }
    return out;
  }

  /**
   * Conversation list often omits `profile_pic` on nested participants even when
   * requested. Resolve it via the user profile node (same as User Profile API).
   */
  private async enrichParticipantProfilePics(
    result: InstagramConversationsResponseDto,
    accessToken: string,
  ): Promise<void> {
    const conversations = result.data ?? [];
    const idsMissingPic = new Set<string>();
    for (const conv of conversations) {
      for (const p of conv.participants?.data ?? []) {
        const id = p.id?.trim();
        if (!id) continue;
        if (!p.profile_pic?.trim()) idsMissingPic.add(id);
      }
    }
    if (idsMissingPic.size === 0) return;

    const idList = [...idsMissingPic];
    const picById = new Map<string, string | undefined>();
    const concurrency = 8;
    for (let i = 0; i < idList.length; i += concurrency) {
      const batch = idList.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (id) => {
          const pic = await this.fetchScopedUserProfilePic(id, accessToken);
          picById.set(id, pic);
        }),
      );
    }

    for (const conv of conversations) {
      const participants = conv.participants?.data;
      if (!participants) continue;
      for (const p of participants) {
        const id = p.id?.trim();
        if (!id) continue;
        const fetched = picById.get(id);
        if (fetched && !p.profile_pic?.trim()) {
          p.profile_pic = fetched;
        }
      }
    }
  }

  private async fetchScopedUserProfilePic(
    userId: string,
    accessToken: string,
  ): Promise<string | undefined> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(userId)}`,
    );
    url.searchParams.set("fields", "profile_pic");
    url.searchParams.set("access_token", accessToken);
    try {
      const body = await this.instagramGraphFetch<{ profile_pic?: string }>(
        url,
      );
      return body.profile_pic?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Pagination for GET .../messages (database-backed endpoint).
   */
  parseDbPagingForMessages(
    pageRaw?: string,
    pageSizeRaw?: string,
  ): { page: number; pageSize: number } {
    const parseIntStrict = (
      raw: string | undefined,
      field: "page" | "pageSize",
      fallback: number,
    ): number => {
      if (raw == null) return fallback;
      const t = raw.trim();
      if (t.length === 0) return fallback;
      if (!/^\d+$/.test(t)) {
        throw new BadRequestException(`${field} must be a positive integer`);
      }
      const n = Number(t);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException(`${field} must be a positive integer`);
      }
      return n;
    };

    const page = parseIntStrict(pageRaw, "page", 1);
    const pageSize = parseIntStrict(pageSizeRaw, "pageSize", 50);
    const maxPageSize = 200;
    if (pageSize > maxPageSize) {
      throw new BadRequestException(`pageSize must be <= ${maxPageSize}`);
    }
    return { page, pageSize };
  }

  /**
   * Meta OAuth / Graph: (#230) = token cannot access messaging for this Page without
   * `pages_messaging` (and related Instagram messaging scopes on the Page token).
   */
  private throwIfInstagramGraphFailure(
    ok: boolean,
    status: number,
    body: unknown,
  ): void {
    if (ok) return;
    const err = body as InstagramErrorResponse;
    const code = err?.error?.code;
    const msg =
      err?.error?.message ??
      `Instagram Graph API request failed with status ${status}`;
    if (
      code === 230 ||
      /pages_messaging/i.test(msg) ||
      /\(#[0-9]+\)\s*Requires pages_messaging/i.test(msg)
    ) {
      throw new ForbiddenException(
        "Facebook / Instagram access token is missing the pages_messaging permission (Graph error #230). " +
          "In developers.facebook.com: add “pages_messaging” (and Instagram messaging scopes your product needs) to the app, " +
          "re-run Login / Page install so the Page token includes those permissions, then store the new token on this company.",
      );
    }
    throw new BadGatewayException(msg);
  }

  private async instagramGraphFetch<T>(
    url: URL,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(url.toString(), init);
    const bodyText = await response.text();
    let body: T | InstagramErrorResponse = {} as T;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as T | InstagramErrorResponse;
      } catch {
        throw new BadGatewayException(
          "Instagram Graph API returned invalid JSON",
        );
      }
    }

    this.throwIfInstagramGraphFailure(response.ok, response.status, body);

    return body as T;
  }
}
