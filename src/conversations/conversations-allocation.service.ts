import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company,
  Conversation,
  ConversationMessage,
  ConversationSource,
  InstagramUser,
} from '../database/entities';
import type {
  InstagramConversationDto,
  InstagramConversationParticipantDto,
  InstagramConversationsResponseDto,
} from './dto/http/instagram-conversations-response.dto';
import type {
  InstagramMessageDto,
  InstagramMessagesResponseDto,
} from './dto/http/instagram-messages-response.dto';
import type {
  InstagramWebhookMessagingItem,
  InstagramWebhookPayload,
} from '../webhook/instagram-webhook-payload.types';

type InstagramErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

@Injectable()
export class ConversationsAllocationService {
  private readonly log = new Logger(ConversationsAllocationService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
  ) {}

  /**
   * Webhook-driven allocation: fetch message + conversation from Graph, upsert `conversations`,
   * persist `conversation_messages`.
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
      const company = await this.companyRepo.findOne({
        where: { businessAccountId: entryPageId },
        order: { id: 'DESC' },
      });
      if (!company) {
        this.log.warn(`${t} entry[${ei}] no company for page_id=${entryPageId}`);
        continue;
      }

      this.log.log(
        `${t} entry[${ei}] company found id=${company.id} owner_id=${company.ownerId}`,
      );

      const pageTrim = company.pageId.trim();
      const accessToken = company.accessToken;
      this.log.debug(
        `${t} entry[${ei}] Graph token resolved for company=${company.id}`,
      );

      for (let mi = 0; mi < messaging.length; mi++) {
        const ev = messaging[mi];
        const readMid = ev.read?.mid?.trim();
        if (readMid) {
          const readAt = new Date(ev.timestamp ?? entry.time);
          await this.applyReadWebhookByMid(
            readMid,
            company.ownerId,
            Number.isNaN(readAt.getTime()) ? new Date() : readAt,
            traceId,
          );
        }

        const midJobs = this.mergeWebhookMidsForEvent(ev, entry.time);
        if (midJobs.length === 0) {
          this.log.log(
            `${t} entry[${ei}] messaging[${mi}] skip (no mid in message/read/message_edit/reaction)`,
          );
          continue;
        }
        this.log.log(
          `${t} entry[${ei}] messaging[${mi}] jobs=${JSON.stringify(
            midJobs.map((j) => ({
              mid: j.mid.length > 64 ? `${j.mid.slice(0, 64)}...` : j.mid,
              editedAt: j.editedAt?.toISOString() ?? null,
              senderHint: j.senderHintId,
            })),
          )}`,
        );

        for (const { mid, editedAt, senderHintId } of midJobs) {
          try {
            await this.allocateSingleWebhookMessage({
              traceId,
              mid,
              pageId: pageTrim,
              businessInstagramId: company.instagramAccountId,
              ownerId: company.ownerId,
              accessToken,
              ...(editedAt != null ? { editedAt } : {}),
              senderHintId,
              webhookMessaging: ev,
            });
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            this.log.warn(`${t} mid failed page=${pageTrim}: ${err}`);
          }
        }
      }
    }

    this.log.log(`${t} allocate done`);
  }

  /**
   * GET `/v25.0/{message-id}?fields=…` — reusable Graph helper.
   */
  private async fetchInstagramMessageById(
    messageId: string,
    accessToken: string,
    fields = 'id,created_time,from,to,message',
  ): Promise<InstagramMessageDto> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(messageId)}`,
    );
    url.searchParams.set('fields', fields);
    url.searchParams.set('access_token', accessToken);
    return this.instagramGraphFetch<InstagramMessageDto>(url);
  }

  /**
   * GET `/v25.0/{page-id}/conversations?platform=instagram&user_id=…` — reusable Graph helper.
   */
  private async fetchInstagramConversationsForUser(
    pageId: string,
    userId: string,
    accessToken: string,
  ): Promise<InstagramConversationDto[]> {
    const out: InstagramConversationDto[] = [];
    const fields = encodeURIComponent('id,participants,updated_time');
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

  /** One mid per key; `message_edit` wins `editedAt` for that mid. Reactions use `reaction.mid`. */
  private mergeWebhookMidsForEvent(
    ev: InstagramWebhookMessagingItem,
    entryTimeMs: number,
  ): { mid: string; editedAt?: Date; senderHintId?: string }[] {
    const eventMs = ev.timestamp ?? entryTimeMs;
    const asDate = (ms: number): Date => {
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    };

    const pairs: { mid: string; fromEdit: boolean }[] = [];
    const pushMid = (raw: string | undefined, fromEdit: boolean) => {
      const mid = raw?.trim();
      if (mid) pairs.push({ mid, fromEdit });
    };
    pushMid(ev.message?.mid, false);
    const numEdit = ev.message_edit?.num_edit;
    pushMid(ev.message_edit?.mid, (numEdit ?? 0) > 0);
    pushMid(ev.reaction?.mid, false);

    const byMid = new Map<string, Date | undefined>();
    for (const p of pairs) {
      if (p.fromEdit) {
        byMid.set(p.mid, asDate(eventMs));
      } else if (!byMid.has(p.mid)) {
        byMid.set(p.mid, undefined);
      }
    }

    const reactionMid = ev.reaction?.mid?.trim();
    const reactionSender = ev.sender?.id?.trim();
    const reactionHint =
      reactionMid && reactionSender ? reactionSender : undefined;

    return [...byMid.entries()].map(([mid, editedAt]) => ({
      mid,
      editedAt,
      senderHintId:
        mid === reactionMid && reactionHint ? reactionHint : undefined,
    }));
  }

  private pickCustomerUserIdFromMessage(
    m: InstagramMessageDto,
    pageId: string,
    businessInstagramId?: string | null,
  ): string | null {
    const excludedIds = new Set(
      [pageId, businessInstagramId ?? undefined]
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
    pageId: string,
    businessInstagramId?: string | null,
    senderHintId?: string | null,
  ): string | null {
    const excludedIds = new Set(
      [pageId, businessInstagramId ?? undefined]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );

    const fromGraph = this.pickCustomerUserIdFromMessage(
      m,
      pageId,
      businessInstagramId,
    );
    if (fromGraph) {
      return fromGraph;
    }
    const hint = senderHintId?.trim();
    if (
      hint &&
      this.isLikelyInstagramPsid(hint) &&
      !excludedIds.has(hint)
    ) {
      return hint;
    }
    return null;
  }

  private async allocateSingleWebhookMessage(opts: {
    traceId: string;
    mid: string;
    pageId: string;
    businessInstagramId?: string | null;
    ownerId: number;
    accessToken: string;
    editedAt?: Date;
    /** Webhook `sender` when the event is a reaction (Graph message may not list both parties). */
    senderHintId?: string | null;
    webhookMessaging: InstagramWebhookMessagingItem;
  }): Promise<void> {
    const t = `[webhook trace=${opts.traceId}]`;
    const messageFieldsWithReactions =
      'id,created_time,from,to,reply_to,message,reactions{data{reaction,users{id,username}}}';
    const msg = await this.fetchInstagramMessageById(
      opts.mid,
      opts.accessToken,
      messageFieldsWithReactions,
    );
    const graphMsgId = msg.id?.trim() ?? opts.mid;
    this.log.log(
      `${t} mid Graph message loaded id=${graphMsgId} created_time=${msg.created_time}`,
    );

    const customerUserId = this.pickCustomerUserIdForWebhook(
      msg,
      opts.pageId,
      opts.businessInstagramId,
      opts.senderHintId,
    );
    if (!customerUserId) {
      throw new Error(
        'Could not resolve customer user_id from message from/to or webhook sender',
      );
    }
    this.log.log(`${t} mid customer user_id=${customerUserId}`);

    const convList = await this.fetchInstagramConversationsForUser(
      opts.pageId,
      customerUserId,
      opts.accessToken,
    );

    this.log.log(
      `${t} mid conversations edge count=${convList.length} first_id=${convList[0]?.id ?? 'none'}`,
    );

    let graphConversationId: string | undefined = convList[0]?.id?.trim();

    if (!graphConversationId) {
      this.log.log(
        `${t} mid conversations edge empty - fetching message with conversation{id}`,
      );
      const extended = await this.fetchInstagramMessageById(
        opts.mid,
        opts.accessToken,
        'id,created_time,from,to,message,conversation{id},reactions{data{reaction,users{id,username}}}',
      );
      graphConversationId = extended.conversation?.id?.trim();
      if (graphConversationId) {
        this.log.log(
          `${t} mid resolved conversation id from message node id=${graphConversationId}`,
        );
      }
    }

    if (!graphConversationId) {
      throw new Error(
        'Could not resolve Instagram conversation id (user conversations edge empty and message.conversation missing)',
      );
    }

    const igConv = convList.find((c) => c.id?.trim() === graphConversationId);

    const updatedTime = (() => {
      if (igConv?.updated_time) {
        const d = new Date(igConv.updated_time);
        if (!Number.isNaN(d.getTime())) return d;
      }
      const d = new Date(msg.created_time);
      if (!Number.isNaN(d.getTime())) return d;
      return new Date();
    })();

    const participantId = igConv
      ? this.pickCustomerParticipantId(
          igConv.participants?.data ?? [],
          opts.pageId,
          opts.businessInstagramId,
        )
      : this.pickCustomerUserIdFromMessage(
          msg,
          opts.pageId,
          opts.businessInstagramId,
        ) ?? 'unknown';

    let row = await this.conversationRepo.findOne({
      where: { managerId: opts.ownerId, externalId: graphConversationId },
    });

    if (!row) {
      row = this.conversationRepo.create({
        externalSourceId: opts.pageId,
        externalId: graphConversationId,
        instUpdatedAt: updatedTime,
        readAt: null,
        participantId,
        source: ConversationSource.INSTAGRAM,
        managerId: opts.ownerId,
        groupId: null,
      });
      this.log.log(
        `${t} mid conversation CREATE external_id=${graphConversationId} participant=${participantId}`,
      );
    } else {
      row.instUpdatedAt = updatedTime;
      row.participantId =
        participantId !== 'unknown' ? participantId : row.participantId;
      row.externalSourceId = opts.pageId;
      this.log.log(
        `${t} mid conversation UPDATE db_id=${row.id} external_id=${graphConversationId} inst_updated_at=${updatedTime.toISOString()}`,
      );
    }
    await this.conversationRepo.save(row);

    await this.persistInstagramMessages(
      row.id,
      [msg],
      {
        ...(opts.editedAt != null ? { editedAt: opts.editedAt } : {}),
        webhookMessaging: opts.webhookMessaging,
      },
    );
    await this.syncInstagramUsersForWebhookAllocation(
      msg,
      igConv?.participants?.data,
      opts.accessToken,
      opts.traceId,
      opts.senderHintId,
    );
    this.log.log(
      `${t} mid OK persisted message external_id=${graphMsgId} conversation_db_id=${row.id}`,
    );
  }

  private async persistInstagramMessages(
    conversationDbId: number,
    messages: InstagramMessageDto[],
    options?: { editedAt?: Date; webhookMessaging?: InstagramWebhookMessagingItem },
  ): Promise<void> {
    for (const m of messages) {
      const ext = m.id?.trim();
      if (!ext) continue;
      const createdAt = new Date(m.created_time);
      if (Number.isNaN(createdAt.getTime())) continue;
      const senderId = m.from?.id?.trim() ?? '';
      const receiverId = m.to?.data?.[0]?.id?.trim() ?? '';
      const text = m.message ?? '';
      const replyToExternalId = options?.webhookMessaging?.message?.reply_to?.mid?.trim();
      const replyToId = await this.resolveReplyToId(
        conversationDbId,
        ext,
        replyToExternalId,
      );
      const { id: _messageId, ...messageWithoutId } = m;
      const instagramJson = JSON.stringify({
        ...messageWithoutId,
        ...(options?.webhookMessaging != null
          ? {
              webhook_messaging:
                this.sanitizeWebhookMessagingForStorage(options.webhookMessaging),
            }
          : {}),
      });

      let row = await this.conversationMessageRepo.findOne({
        where: { conversationId: conversationDbId, externalId: ext },
      });
      if (!row) {
        row = this.conversationMessageRepo.create({
          conversationId: conversationDbId,
          externalId: ext,
          message: text,
          instagramJson,
          createdAt,
          senderId: senderId.length > 0 ? senderId : '0',
          receiverId: receiverId.length > 0 ? receiverId : '0',
          readAt: null,
          replyToId,
          ...(options?.editedAt != null ? { editedAt: options.editedAt } : {}),
        });
      } else {
        row.message = text;
        row.instagramJson = instagramJson;
        row.createdAt = createdAt;
        row.senderId = senderId.length > 0 ? senderId : row.senderId;
        row.receiverId = receiverId.length > 0 ? receiverId : row.receiverId;
        if (replyToId != null) {
          row.replyToId = replyToId;
        }
        if (options?.editedAt != null) {
          row.editedAt = options.editedAt;
        }
      }
      await this.conversationMessageRepo.save(row);
    }
  }

  private async applyReadWebhookByMid(
    mid: string,
    ownerId: number,
    readAt: Date,
    traceId: string,
  ): Promise<void> {
    const t = `[webhook trace=${traceId}]`;
    const rows = await this.conversationMessageRepo
      .createQueryBuilder('m')
      .innerJoin(Conversation, 'c', 'c.id = m.conversation_id')
      .where('m.external_id = :mid', { mid })
      .andWhere('c.manager_id = :ownerId', { ownerId })
      .getMany();

    if (rows.length === 0) {
      this.log.debug(`${t} read.mid not found in DB mid=${mid.slice(0, 64)}`);
      return;
    }

    const toSave: ConversationMessage[] = [];
    for (const row of rows) {
      if (row.readAt == null || row.readAt.getTime() < readAt.getTime()) {
        row.readAt = readAt;
        toSave.push(row);
      }
    }
    if (toSave.length > 0) {
      await this.conversationMessageRepo.save(toSave);
      this.log.log(
        `${t} read applied mid=${mid.slice(0, 64)} rows=${toSave.length} at=${readAt.toISOString()}`,
      );
    }
  }

  private async resolveReplyToId(
    conversationDbId: number,
    messageExternalId: string,
    replyToExternalId?: string,
  ): Promise<number | null> {
    const mid = replyToExternalId?.trim();
    if (!mid || mid === messageExternalId) return null;
    const target = await this.conversationMessageRepo.findOne({
      where: { conversationId: conversationDbId, externalId: mid },
      select: { id: true },
    });
    return target?.id ?? null;
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
                      mid: ev.message.reply_to.mid,
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
    pageId: string,
    businessInstagramId?: string | null,
  ): string {
    const ids = participants
      .map((p) => p.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return 'unknown';
    const excludedIds = new Set(
      [pageId, businessInstagramId ?? undefined]
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
      for (const u of item.users ?? []) take(u.id);
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
    url.searchParams.set('access_token', accessToken);
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
    const username = node.username?.trim() || node.id?.trim() || instagramUserId;
    const profilePic = node.profile_pic?.trim() || '';
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
    if (raw == null) return '';
    return String(raw)
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/[\s\u00a0\u200b-\u200d\ufeff,]+/g, '');
  }

  private isLikelyInstagramPsid(id: string | undefined): boolean {
    const t = this.normalizeRecipientIdInput(id ?? '');
    return t.length > 0 && t !== 'unknown' && /^\d+$/.test(t);
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
        'Facebook / Instagram access token is missing the pages_messaging permission (Graph error #230). ' +
          'In developers.facebook.com: add "pages_messaging" (and Instagram messaging scopes your product needs) to the app, ' +
          're-run Login / Page install so the Page token includes those permissions, then store the new token for this company (or Sources / env).',
      );
    }
    throw new BadGatewayException(msg);
  }

  private async instagramGraphFetch<T>(url: URL, init?: RequestInit): Promise<T> {
    const response = await fetch(url.toString(), init);
    const bodyText = await response.text();
    let body: T | InstagramErrorResponse = {} as T;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as T | InstagramErrorResponse;
      } catch {
        throw new BadGatewayException('Instagram Graph API returned invalid JSON');
      }
    }

    this.throwIfInstagramGraphFailure(response.ok, response.status, body);

    return body as T;
  }
}
