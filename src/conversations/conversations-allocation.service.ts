import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Company,
  Conversation,
  ConversationMessage,
  ConversationSource,
  InstagramUser,
} from "../database/entities";
import type {
  InstagramConversationDto,
  InstagramConversationParticipantDto,
  InstagramConversationsResponseDto,
} from "./dto/http/instagram-conversations-response.dto";
import type {
  InstagramMessageDto,
  InstagramMessageReactionItemDto,
  InstagramMessageReactionsDto,
} from "./dto/http/instagram-messages-response.dto";
import type {
  InstagramWebhookMessagingItem,
  InstagramWebhookPayload,
} from "../webhook/instagram-webhook-payload.types";
import { ConversationMessageNotifyService } from "./conversation-message-notify.service";
import { INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS } from "./instagram-graph-message-fields";
import { mergeMessageJsonPreservingReactions } from "./instagram-message-reactions.util";

type WebhookMessagingEventKind =
  | "new_message"
  | "reaction"
  | "read"
  | "edit"
  | "skip";

type InstagramErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

/** Webhook hot path: Page token + owner resolved once per IG business account id. */
type WebhookCompanyContext = {
  id: number;
  ownerId: number;
  instagramAccountId: string;
  accessToken: string;
  pageId: string;
};

@Injectable()
export class ConversationsAllocationService {
  private readonly log = new Logger(ConversationsAllocationService.name);
  /** Avoid repeated `integration` lookups within a webhook burst / steady traffic. */
  private readonly companyByInstagramAccountId = new Map<
    string,
    { ctx: WebhookCompanyContext; expiresAt: number }
  >();
  private readonly companyContextCacheTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
    private readonly messageNotify: ConversationMessageNotifyService,
  ) {
    setInterval(() => this.sweepExpiredCompanyContextCache(), 60_000).unref?.();
  }

  /**
   * Webhook allocation by event kind: new message, reaction, read receipt, or edit.
   */
  async allocateInstagramMessagingWebhook(
    payload: InstagramWebhookPayload,
    traceId: string,
  ): Promise<void> {
    const t = `[webhook trace=${traceId}]`;
    const entries = payload.entry ?? [];
    this.log.log(`${t} allocate start entries=${entries.length}`);

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const entryPageId = entry.id?.trim();
      if (!entryPageId) {
        this.log.warn(`${t} entry[${ei}] skipped (missing id)`);
        continue;
      }

      const messaging = entry.messaging ?? [];
      const companyCtx = await this.resolveWebhookCompanyContext(entryPageId);
      if (!companyCtx) {
        this.log.warn(
          `${t} entry[${ei}] no company for instagram_account_id=${entryPageId}`,
        );
        continue;
      }

      this.log.log(
        `${t} entry[${ei}] company id=${companyCtx.id} owner_id=${companyCtx.ownerId}`,
      );

      const ctx = {
        traceId,
        entry,
        companyCtx,
        businessInstagramId: companyCtx.instagramAccountId,
        accessToken: companyCtx.accessToken,
        pageId: companyCtx.pageId,
      };

      for (let mi = 0; mi < messaging.length; mi++) {
        const ev = messaging[mi];
        const kind = this.classifyWebhookMessagingEvent(ev);
        if (kind === "skip") {
          this.log.log(`${t} entry[${ei}] messaging[${mi}] skip (unclassified)`);
          continue;
        }
        this.log.log(`${t} entry[${ei}] messaging[${mi}] kind=${kind}`);
        try {
          switch (kind) {
            case "new_message":
              await this.handleWebhookNewMessage(ev, ctx);
              break;
            case "reaction":
              await this.handleWebhookReaction(ev, ctx);
              break;
            case "read":
              await this.handleWebhookRead(ev, ctx);
              break;
            case "edit":
              await this.handleWebhookEdit(ev, ctx);
              break;
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.log.warn(`${t} ${kind} failed: ${err}`);
        }
      }
    }

    this.log.log(`${t} allocate done`);
  }

  private classifyWebhookMessagingEvent(
    ev: InstagramWebhookMessagingItem,
  ): WebhookMessagingEventKind {
    if (ev.read?.mid?.trim()) {
      return "read";
    }
    if (ev.reaction?.mid?.trim()) {
      return "reaction";
    }
    const numEdit = ev.message_edit?.num_edit ?? 0;
    if (numEdit > 0 && ev.message_edit?.mid?.trim()) {
      return "edit";
    }
    if (ev.message_edit?.mid?.trim() && ev.message_edit?.num_edit == 0) {
      return "new_message";
    }
    return "skip";
  }

  private graphMessageFieldsWithReactions(): string {
    return [
      "id",
      "created_time",
      "from",
      "to",
      "reply_to",
      "message",
      `attachments{${INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS}}`,
      "reactions{data{reaction,emoji,users{id,username}}}",
    ].join(",");
  }

  /** (1) New message — numEdit 0, no read on event. */
  private async handleWebhookNewMessage(
    ev: InstagramWebhookMessagingItem,
    ctx: {
      traceId: string;
      companyCtx: WebhookCompanyContext;
      businessInstagramId: string;
      accessToken: string;
      pageId: string;
    },
  ): Promise<void> {
    const t = `[webhook trace=${ctx.traceId}]`;
    const mid = ev.message_edit?.mid?.trim();
    if (!mid) {
      return;
    }

    const msg = await this.fetchInstagramMessageById(
      mid,
      ctx.accessToken,
      this.graphMessageFieldsWithReactions(),
    );
    const customerUserId = this.pickCustomerUserIdForWebhook(
      msg,
      ctx.businessInstagramId,
      null,
    );
    if (!customerUserId) {
      throw new Error("Could not resolve customer user_id from message");
    }

    const { row: conv, participantExtras, saveConversation } =
      await this.ensureInstagramConversationRowForWebhook({
        traceId: ctx.traceId,
        msg,
        mid,
        customerUserId,
        businessInstagramId: ctx.businessInstagramId,
        ownerId: ctx.companyCtx.ownerId,
        accessToken: ctx.accessToken,
        pageId: ctx.pageId,
      });

    if (saveConversation) {
      await this.conversationRepo.save(conv);
    }

    const existingMessage = await this.conversationMessageRepo.findOne({
      where: { externalId: mid, conversationId: conv.id },
    });
    const messageRow = this.mergeMessageRowFromGraph(
      existingMessage,
      msg,
      conv,
      ev,
      conv.readAt,
    );

    await this.persistAndNotify(messageRow, ctx.companyCtx.ownerId);
    await this.syncInstagramUsersForWebhookAllocation(
      msg,
      participantExtras,
      ctx.accessToken,
      ctx.traceId,
      null,
    );
    this.log.log(`${t} new_message saved mid=${mid} conversation_id=${conv.id}`);
  }

  /** (2) Reaction — merge into `instagram_json.reactions` (+ optional Graph refresh). */
  private async handleWebhookReaction(
    ev: InstagramWebhookMessagingItem,
    ctx: {
      traceId: string;
      companyCtx: WebhookCompanyContext;
      accessToken: string;
    },
  ): Promise<void> {
    const t = `[webhook trace=${ctx.traceId}]`;
    const mid = ev.reaction?.mid?.trim();
    if (!mid) {
      return;
    }

    const row = await this.conversationMessageRepo.findOne({
      where: { externalId: mid },
    });
    if (!row) {
      this.log.warn(`${t} reaction: message not in DB mid=${mid.slice(0, 64)}`);
      return;
    }

    try {
      const graphMsg = await this.fetchInstagramMessageById(
        mid,
        ctx.accessToken,
        this.graphMessageFieldsWithReactions(),
      );
      row.instagramJson = this.buildInstagramJsonWithWebhookReaction(graphMsg, ev);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `${t} reaction Graph refresh failed mid=${mid.slice(0, 64)}: ${err}; merging webhook into stored json`,
      );
      row.instagramJson = this.buildInstagramJsonWithWebhookReaction(
        this.parseStoredInstagramJsonBase(row),
        ev,
      );
    }

    await this.persistAndNotify(row, ctx.companyCtx.ownerId);
    this.log.log(`${t} reaction saved mid=${mid}`);
  }

  /** (3) Read receipt — bump conversation.read_at and message read_at when present. */
  private async handleWebhookRead(
    ev: InstagramWebhookMessagingItem,
    ctx: {
      traceId: string;
      entry: { time: number };
      companyCtx: WebhookCompanyContext;
      businessInstagramId: string;
      accessToken: string;
      pageId: string;
    },
  ): Promise<void> {
    const t = `[webhook trace=${ctx.traceId}]`;
    const mid = ev.read?.mid?.trim();
    if (!mid) {
      return;
    }

    const readAt = new Date(ev.timestamp ?? ctx.entry.time);
    if (Number.isNaN(readAt.getTime())) {
      return;
    }

    const msg = await this.fetchInstagramMessageById(
      mid,
      ctx.accessToken,
      this.graphMessageFieldsWithReactions(),
    );
    const customerUserId = this.pickCustomerUserIdForWebhook(
      msg,
      ctx.businessInstagramId,
      ev.sender?.id,
    );
    if (!customerUserId) {
      throw new Error("Could not resolve customer user_id for read event");
    }

    let { row: conv, saveConversation } =
      await this.ensureInstagramConversationRowForWebhook({
        traceId: ctx.traceId,
        msg,
        mid,
        customerUserId,
        businessInstagramId: ctx.businessInstagramId,
        ownerId: ctx.companyCtx.ownerId,
        accessToken: ctx.accessToken,
        pageId: ctx.pageId,
      });

    if (saveConversation) {
      conv = await this.conversationRepo.save(conv);
    }

    if (
      conv.readAt == null ||
      conv.readAt.getTime() < readAt.getTime()
    ) {
      conv.readAt = readAt;
    }

    const messageRow = await this.conversationMessageRepo.findOne({
      where: { externalId: mid, conversationId: conv.id },
    });
    if (messageRow) {
      if (
        messageRow.readAt == null ||
        messageRow.readAt.getTime() < readAt.getTime()
      ) {
        messageRow.readAt = readAt;
      }
    }

    await this.conversationRepo.save(conv);
    if (messageRow) {
      await this.persistAndNotify(messageRow, ctx.companyCtx.ownerId);
    } else {
      await this.messageNotify.notifyConversationForOwner(
        ctx.companyCtx.ownerId,
        conv.id,
      );
    }

    this.log.log(
      `${t} read applied conversation_id=${conv.id} mid=${mid.slice(0, 64)} message_in_db=${Boolean(messageRow)}`,
    );
  }

  /** (4) Message edit — numEdit > 0, no read on event. */
  private async handleWebhookEdit(
    ev: InstagramWebhookMessagingItem,
    ctx: {
      traceId: string;
      entry: { time: number };
      accessToken: string;
      companyCtx: WebhookCompanyContext;
    },
  ): Promise<void> {
    const t = `[webhook trace=${ctx.traceId}]`;
    const mid = ev.message_edit?.mid?.trim();
    if (!mid) {
      return;
    }

    const editedAt = new Date(ev.timestamp ?? ctx.entry.time);
    if (Number.isNaN(editedAt.getTime())) {
      return;
    }

    const msg = await this.fetchInstagramMessageById(
      mid,
      ctx.accessToken,
      this.graphMessageFieldsWithReactions(),
    );

    const row = await this.conversationMessageRepo.findOne({
      where: { externalId: mid },
    });
    if (!row) {
      this.log.warn(`${t} edit: message not in DB mid=${mid.slice(0, 64)}`);
      return;
    }

    const ext = msg.id?.trim() ?? mid;
    const text = msg.message ?? "";
    const { reply_to, id, ...messageWithoutId } = msg;
    void reply_to;
    void id;
    row.message = text;
    row.instagramJson = JSON.stringify(
      mergeMessageJsonPreservingReactions(row.instagramJson, {
        ...messageWithoutId,
        webhook_messaging: this.sanitizeWebhookMessagingForStorage(ev),
      }),
    );
    row.editedAt = editedAt;
    const createdAt = new Date(msg.created_time);
    if (!Number.isNaN(createdAt.getTime())) {
      row.createdAt = createdAt;
    }

    await this.persistAndNotify(row, ctx.companyCtx.ownerId);
    this.log.log(`${t} edit saved mid=${ext}`);
  }

  private buildMessageRowFromGraph(
    msg: InstagramMessageDto,
    conversationDbId: number,
    ev: InstagramWebhookMessagingItem,
    options?: { inheritReadAtFromConversation?: Date | null },
  ): ConversationMessage {
    const ext = msg.id?.trim() ?? "";
    const createdAt = new Date(msg.created_time);
    const senderId = msg.from?.id?.trim() ?? "";
    const receiverId = msg.to?.data?.[0]?.id?.trim() ?? "";
    const text = msg.message ?? "";
    const parentMidRaw =
      msg.reply_to?.mid?.trim() || ev.message?.reply_to?.mid?.trim();
    const repliedToFromPayload =
      parentMidRaw && parentMidRaw !== ext ? parentMidRaw : null;
    const { reply_to, id, ...messageWithoutId } = msg;
    void reply_to;
    void id;

    let readAt: Date | null = null;
    const convRead = options?.inheritReadAtFromConversation;
    if (
      convRead != null &&
      !Number.isNaN(createdAt.getTime()) &&
      convRead.getTime() > createdAt.getTime()
    ) {
      readAt = convRead;
    }

    const instagramJson = JSON.stringify({
      ...messageWithoutId,
      webhook_messaging: this.sanitizeWebhookMessagingForStorage(ev),
    });

    return this.conversationMessageRepo.create({
      conversationId: conversationDbId,
      externalId: ext,
      message: text,
      instagramJson,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      senderId: senderId.length > 0 ? senderId : "0",
      receiverId: receiverId.length > 0 ? receiverId : "0",
      readAt,
      repliedToExternalId: repliedToFromPayload,
    });
  }

  /** Caller loads `existing` (or passes null); no DB read inside. */
  private mergeMessageRowFromGraph(
    existing: ConversationMessage | null,
    msg: InstagramMessageDto,
    conversation: Conversation,
    ev: InstagramWebhookMessagingItem,
    convReadAt: Date | null,
  ): ConversationMessage {
    const ext = msg.id?.trim();
    if (!ext) {
      throw new Error("Message id missing from Graph");
    }

    const fresh = this.buildMessageRowFromGraph(msg, conversation.id, ev, {
      inheritReadAtFromConversation: convReadAt,
    });

    if (!existing) {
      if(conversation.readAt != null && conversation.readAt.getTime() > fresh.createdAt?.getTime()) {
        fresh.readAt = conversation.readAt;
      }
      return fresh;
    }

    existing.message = fresh.message;
    const freshPayload = JSON.parse(fresh.instagramJson) as Record<
      string,
      unknown
    >;
    existing.instagramJson = JSON.stringify(
      mergeMessageJsonPreservingReactions(
        existing.instagramJson,
        freshPayload,
      ),
    );
    existing.createdAt = fresh.createdAt;
    existing.senderId = fresh.senderId;
    existing.receiverId = fresh.receiverId;
    if (fresh.repliedToExternalId != null) {
      existing.repliedToExternalId = fresh.repliedToExternalId;
    }
    if (
      (conversation.readAt == null ||
        conversation.readAt.getTime() > fresh.createdAt?.getTime())
    ) {
      existing.readAt = fresh.readAt;
    }
    return existing;
  }

  private sweepExpiredCompanyContextCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.companyByInstagramAccountId.entries()) {
      if (entry.expiresAt <= now) {
        this.companyByInstagramAccountId.delete(key);
      }
    }
  }

  private async resolveWebhookCompanyContext(
    instagramAccountId: string,
  ): Promise<WebhookCompanyContext | null> {
    const key = instagramAccountId.trim();
    if (!key) {
      return null;
    }

    const cached = this.companyByInstagramAccountId.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ctx;
    }

    const company = await this.companyRepo.findOne({
      where: { instagramAccountId: key },
      order: { id: "DESC" },
    });
    if (!company) {
      this.companyByInstagramAccountId.delete(key);
      return null;
    }

    const accessToken = company.accessToken?.trim() ?? "";
    const businessInstagramId = company.instagramAccountId?.trim() ?? "";
    if (!businessInstagramId || !accessToken) {
      return null;
    }

    const ctx: WebhookCompanyContext = {
      id: company.id,
      ownerId: company.ownerId,
      instagramAccountId: businessInstagramId,
      accessToken,
      pageId: company.pageId,
    };
    this.companyByInstagramAccountId.set(key, {
      ctx,
      expiresAt: Date.now() + this.companyContextCacheTtlMs,
    });
    return ctx;
  }

  /**
   * GET `/v25.0/{message-id}?fields=…` — reusable Graph helper.
   */
  private async fetchInstagramMessageById(
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
   * GET `/v25.0/{instagram-business-account-id}/conversations?platform=instagram&user_id=…`
   *
   * `customerInstagramUserId` is the Instagram-scoped **other party** id (same value we store as
   * `conversations.participant_id`); Meta expects it as the `user_id` query param.
   */
  private async fetchInstagramConversationsForUser(
    businessInstagramId: string,
    customerInstagramUserId: string,
    accessToken: string,
  ): Promise<InstagramConversationDto[]> {
    const out: InstagramConversationDto[] = [];
    const fields = encodeURIComponent("id,participants,updated_time");
    let nextUrl: string | null =
      `https://graph.facebook.com/v25.0/${encodeURIComponent(businessInstagramId)}/conversations` +
      `?platform=instagram&user_id=${encodeURIComponent(customerInstagramUserId)}&fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

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

  private pickCustomerUserIdFromMessage(
    m: InstagramMessageDto,
    businessInstagramId: string,
  ): string | null {
    const excludedIds = new Set(
      [businessInstagramId]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );
    const fromId = m.from?.id?.trim();
    if (
      this.isLikelyInstagramPsid(fromId) &&
      fromId !== undefined &&
      !excludedIds.has(fromId)
    ) {
      return fromId;
    }
    for (const t of m.to?.data ?? []) {
      const tid = t.id?.trim();
      if (
        this.isLikelyInstagramPsid(tid) &&
        tid !== undefined &&
        !excludedIds.has(tid)
      ) {
        return tid;
      }
    }
    return null;
  }

  /** Resolves "customer" PSID from Graph message; falls back to webhook `sender` for reaction deliveries. */
  private pickCustomerUserIdForWebhook(
    m: InstagramMessageDto,
    businessInstagramId: string,
    senderHintId?: string | null,
  ): string | null {
    const excludedIds = new Set(
      [businessInstagramId]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );

    const fromGraph = this.pickCustomerUserIdFromMessage(
      m,
      businessInstagramId,
    );
    if (fromGraph) {
      return fromGraph;
    }
    const hint = senderHintId?.trim();
    if (hint && this.isLikelyInstagramPsid(hint) && !excludedIds.has(hint)) {
      return hint;
    }
    return null;
  }

  private instUpdatedAtFromWebhookMessage(
    msg: InstagramMessageDto,
    igConv?: InstagramConversationDto,
  ): Date {
    if (igConv?.updated_time) {
      const d = new Date(igConv.updated_time);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(msg.created_time);
    if (!Number.isNaN(d.getTime())) return d;
    return new Date();
  }

  /**
   * Finds or builds the `Conversation` row: by customer `participant_id` first, else via Graph
   * (`/conversations?user_id=…` then optional `message.conversation`).
   */
  private async ensureInstagramConversationRowForWebhook(params: {
    traceId: string;
    msg: InstagramMessageDto;
    mid: string;
    customerUserId: string;
    businessInstagramId: string;
    ownerId: number;
    accessToken: string;
    pageId: string;
  }): Promise<{
    row: Conversation;
    participantExtras: InstagramConversationParticipantDto[] | undefined;
    saveConversation: boolean;
  }> {
    const t = `[webhook trace=${params.traceId}]`;
    const {
      msg,
      mid,
      customerUserId,
      businessInstagramId,
      ownerId,
      accessToken,
    } = params;

    let row = await this.conversationRepo.findOne({
      where: {
        managerId: ownerId,
        participantId: customerUserId,
        source: ConversationSource.INSTAGRAM,
      },
      order: { id: "DESC" },
    });

    if (row) {
      this.log.log(
        `${t} conversation matched by participant_id=${customerUserId} db_id=${row.id} (no save)`,
      );
      return { row, participantExtras: undefined, saveConversation: false };
    }

    this.log.log(
      `${t} no DB row for participant_id=${customerUserId}; Graph user_id=${customerUserId}`,
    );

    const convList = await this.fetchInstagramConversationsForUser(
      params.pageId,
      customerUserId,
      accessToken,
    );
    this.log.log(
      `${t} Graph conversations count=${convList.length} first_id=${convList[0]?.id ?? "none"}`,
    );

    let graphConversationId: string | undefined = convList[0]?.id?.trim();

    if (!graphConversationId) {
      this.log.log(
        `${t} conversations edge empty; loading message.conversation{id}`,
      );
      const extended = await this.fetchInstagramMessageById(
        mid,
        accessToken,
        [
          "id",
          "created_time",
          "from",
          "to",
          "message",
          `attachments{${INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS}}`,
          "conversation{id}",
          "reactions{data{reaction,emoji,users{id,username}}}",
        ].join(","),
      );
      graphConversationId = extended.conversation?.id?.trim();
      if (graphConversationId) {
        this.log.log(
          `${t} conversation id from message node id=${graphConversationId}`,
        );
      }
    }

    if (!graphConversationId) {
      throw new Error(
        "Could not resolve Instagram conversation id (user conversations edge empty and message.conversation missing)",
      );
    }

    const igConv = convList.find((c) => c.id?.trim() === graphConversationId);
    const updatedTime = this.instUpdatedAtFromWebhookMessage(msg, igConv);
    const participantId = igConv
      ? this.pickCustomerParticipantId(
          igConv.participants?.data ?? [],
          businessInstagramId,
        )
      : (this.pickCustomerUserIdFromMessage(msg, businessInstagramId) ??
        "unknown");

    row = await this.conversationRepo.findOne({
      where: { managerId: ownerId, externalId: graphConversationId },
    });

    if (!row) {
      row = this.conversationRepo.create({
        externalSourceId: businessInstagramId,
        externalId: graphConversationId,
        instUpdatedAt: updatedTime,
        readAt: null,
        participantId,
        source: ConversationSource.INSTAGRAM,
        managerId: ownerId,
        groupId: null,
      });
      this.log.log(
        `${t} conversation CREATE external_id=${graphConversationId} participant=${participantId}`,
      );
      return {
        row,
        participantExtras: igConv?.participants?.data,
        saveConversation: true,
      };
    }

    this.log.log(
      `${t} conversation matched by external_id db_id=${row.id} external_id=${graphConversationId} (no save)`,
    );
    return {
      row,
      participantExtras: igConv?.participants?.data,
      saveConversation: false,
    };
  }

  /** Save row, then WS push with the same `InstagramMessageDto` as GET .../messages `data[]`. */
  private async persistAndNotify(
    row: ConversationMessage,
    ownerId: number,
  ): Promise<ConversationMessage> {
    const saved = await this.conversationMessageRepo.save(row);
    await this.messageNotify.notifyPersistedMessage(saved, ownerId);
    return saved;
  }

  /** Base object stored in `instagram_json` (Graph message node without top-level `id`). */
  private parseStoredInstagramJsonBase(
    row: ConversationMessage,
  ): Record<string, unknown> {
    try {
      const parsed = JSON.parse(row.instagramJson) as Record<string, unknown>;
      const createdTime = parsed.created_time;
      if (typeof createdTime === "string" && createdTime.length > 0) {
        return parsed;
      }
    } catch {
      /* rebuild from columns */
    }
    return {
      id: row.externalId,
      created_time: row.createdAt.toISOString(),
      message: row.message,
      ...(row.senderId && row.senderId !== "0"
        ? { from: { id: row.senderId } }
        : {}),
      ...(row.receiverId && row.receiverId !== "0"
        ? { to: { data: [{ id: row.receiverId }] } }
        : {}),
    };
  }

  private graphMessageToInstagramJsonBase(
    msg: InstagramMessageDto,
  ): Record<string, unknown> {
    const { reply_to, id, ...messageWithoutId } = msg;
    void reply_to;
    void id;
    return messageWithoutId as Record<string, unknown>;
  }

  private normalizeInstagramJsonBase(
    base: InstagramMessageDto | Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      typeof base === "object" &&
      base !== null &&
      "created_time" in base &&
      typeof (base as InstagramMessageDto).created_time === "string" &&
      "id" in base
    ) {
      return this.graphMessageToInstagramJsonBase(base as InstagramMessageDto);
    }
    const rec = { ...(base as Record<string, unknown>) };
    delete rec.id;
    return rec;
  }

  private buildInstagramJsonWithWebhookReaction(
    base: InstagramMessageDto | Record<string, unknown>,
    ev: InstagramWebhookMessagingItem,
  ): string {
    const record = this.normalizeInstagramJsonBase(base);
    const withReactions = this.applyWebhookReactionToMessage(record, ev);
    return JSON.stringify({
      ...withReactions,
      webhook_messaging: this.sanitizeWebhookMessagingForStorage(ev),
    });
  }

  /**
   * Instagram reaction webhooks carry `emoji` on the event; Graph `reactions` often omit it.
   * Merge webhook react/unreact into `reactions` so REST + WebSocket emit include emoji.
   */
  private applyWebhookReactionToMessage(
    message: Record<string, unknown>,
    ev?: InstagramWebhookMessagingItem,
  ): Record<string, unknown> {
    const reactionEv = ev?.reaction;
    if (!reactionEv) {
      return message;
    }

    const senderId = ev?.sender?.id?.trim();
    const emoji = reactionEv.emoji?.trim();
    const reactionType = reactionEv.reaction?.trim();
    if (!emoji && !reactionType) {
      return message;
    }
    if (!senderId) {
      return message;
    }

    const action = (reactionEv.action ?? "react").trim().toLowerCase();
    const reactions = this.cloneReactionsForMerge(
      message.reactions as InstagramMessageReactionsDto | undefined,
    );

    if (action === "unreact") {
      for (const item of reactions.data ?? []) {
        if (!this.reactionItemMatches(item, emoji, reactionType)) {
          continue;
        }
        item.users = (item.users ?? []).filter(
          (u) => u.id?.trim() !== senderId,
        );
      }
      reactions.data = (reactions.data ?? []).filter(
        (item) => (item.users?.length ?? 0) > 0,
      );
    } else {
      for (const item of reactions.data ?? []) {
        item.users = (item.users ?? []).filter(
          (u) => u.id?.trim() !== senderId,
        );
      }
      reactions.data = (reactions.data ?? []).filter(
        (item) => (item.users?.length ?? 0) > 0,
      );

      let item = reactions.data.find((i) =>
        this.reactionItemMatches(i, emoji, reactionType),
      );
      if (!item) {
        item = {
          reaction: reactionType || emoji,
          ...(emoji ? { emoji } : {}),
          users: [],
        };
        reactions.data.push(item);
      } else {
        if (emoji) {
          item.emoji = emoji;
        }
        if (reactionType && !item.reaction) {
          item.reaction = reactionType;
        }
      }

      const users = item.users ?? [];
      if (!users.some((u) => u.id?.trim() === senderId)) {
        users.push({ id: senderId });
      }
      item.users = users;
    }

    return {
      ...message,
      reactions,
    };
  }

  private cloneReactionsForMerge(
    reactions?: InstagramMessageReactionsDto,
  ): InstagramMessageReactionsDto {
    return {
      data: (reactions?.data ?? []).map((item) => ({
        ...item,
        users: [...(item.users ?? [])],
      })),
    };
  }

  private reactionItemMatches(
    item: InstagramMessageReactionItemDto,
    emoji?: string,
    reactionType?: string,
  ): boolean {
    if (emoji && (item.emoji === emoji || item.reaction === emoji)) {
      return true;
    }
    if (reactionType && item.reaction === reactionType) {
      return true;
    }
    return false;
  }

  private sanitizeWebhookMessagingForStorage(
    ev: InstagramWebhookMessagingItem,
  ): Record<string, unknown> {
    return {
      ...ev,
      ...(ev.read != null ? { read: {} } : {}),
      ...(ev.message_edit != null
        ? { message_edit: { num_edit: ev.message_edit.num_edit } }
        : {}),
      ...(ev.message != null
        ? {
            message: {
              text: ev.message.text,
              is_echo: ev.message.is_echo,
              ...(ev.message.reply_to != null
                ? {
                    reply_to: {
                      is_self_reply: ev.message.reply_to.is_self_reply,
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(ev.reaction != null
        ? {
            reaction: {
              action: ev.reaction.action,
              reaction: ev.reaction.reaction,
              emoji: ev.reaction.emoji,
            },
          }
        : {}),
    };
  }

  private pickCustomerParticipantId(
    participants: InstagramConversationParticipantDto[],
    businessInstagramId: string,
  ): string {
    const ids = participants
      .map((p) => p.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return "unknown";
    const excludedIds = new Set(
      [businessInstagramId]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );
    const customerId = ids.find((id) => !excludedIds.has(id));
    return customerId ?? ids[0];
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
          'In developers.facebook.com: add "pages_messaging" (and Instagram messaging scopes your product needs) to the app, ' +
          "re-run Login / Page install so the Page token includes those permissions, then store the new Page token on the company (OAuth).",
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
