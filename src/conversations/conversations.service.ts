import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Company,
  Conversation,
  ConversationMessage,
  ConversationSource,
  InstagramUser,
  Source,
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
import type { SendInstagramMessageResponseDto } from './dto/http/send-instagram-message-response.dto';
import type {
  ConversationRowDto,
  ConversationParticipantDto,
} from './dto/http/conversations-list-response.dto';

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
    private readonly config: ConfigService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
  ) {}

  async listConversationsForOwner(ownerId: number): Promise<{
    items: ConversationRowDto[];
  }> {
    const company = await this.requireCompanyForOwner(ownerId);
    const myAccountIds = this.buildMyInstagramIds(company);
    const rows = await this.conversationRepo.find({
      where: { managerId: ownerId },
      order: { instUpdatedAt: 'DESC' },
    });
    const lastMessageByConversationId = await this.getLastMessageByConversationIds(
      rows.map((r) => r.id),
    );
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
    const company = await this.requireCompanyForOwner(ownerId);
    const pageId = company.pageId?.trim();
    if (!pageId || pageId === 'pending') {
      throw new BadRequestException(
        'Company Instagram / Facebook page id is not configured; set page_id before sync.',
      );
    }
    const token = await this.resolveGraphAccessToken(company.id);
    const conversations = await this.fetchAllInstagramConversations(pageId, token);
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
  async fetchInstagramConversationsForUser(
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

  async getConversationForOwnerById(
    ownerId: number,
    id: number,
  ): Promise<ConversationRowDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const myAccountIds = this.buildMyInstagramIds(company);
    const row = await this.conversationRepo.findOne({
      where: { id, managerId: ownerId },
    });
    if (!row) {
      throw new NotFoundException('Conversation not found');
    }
    const lastMessageByConversationId = await this.getLastMessageByConversationIds(
      [row.id],
    );
    const participantById = await this.getInstagramUsersByIds(
      [row.participantId],
    );
    return this.toConversationRowDto(
      row,
      lastMessageByConversationId.get(row.id),
      participantById,
      myAccountIds,
    );
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
      lastMessage: lastMessage?.message ?? '',
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
    if (!senderId || senderId === '0') return null;
    return myAccountIds.has(senderId);
  }

  private buildMyInstagramIds(company: Company): Set<string> {
    return new Set(
      [
        company.instagramAccountId,
        company.pageId,
        company.businessAccountId,
      ]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );
  }

  private toConversationParticipantDto(
    participantId: string | undefined,
    participantById: Map<string, InstagramUser>,
  ): ConversationParticipantDto | null {
    const participantKey = participantId?.trim();
    if (!participantKey || participantKey === 'unknown') return null;
    const participant = participantById.get(participantKey);
    if (!participant) return null;
    return {
      id: participant.id,
      name: participant.name,
      username: participant.username,
      profilePic: participant.profilePic,
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
      .createQueryBuilder('m')
      .where('m.conversation_id IN (:...conversationIds)', {
        conversationIds: uniqIds,
      })
      .orderBy('m.conversation_id', 'ASC')
      .addOrderBy('m.created_at', 'DESC')
      .addOrderBy('m.external_id', 'DESC')
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
      throw new BadRequestException('conversationId must not be empty');
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
    throw new NotFoundException('Conversation not found');
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
      'fields',
      [
        'id',
        'created_time',
        'message',
        'is_unsupported',
        'from{id,name,email,username}',
        'to{data{id,name,email,username}}',
        'attachments{id,name,mime_type,size,file_url,image_data{url,width,height,preview_url,animated_gif_url,animated_gif_preview_url,render_as_sticker},video_data{url,preview_url},generic_template}',
        'reactions{data{reaction,users{id,username}}}',
      ].join(','),
    );
    url.searchParams.set('access_token', accessToken);
    if (sinceUnixSeconds != null && Number.isFinite(sinceUnixSeconds)) {
      url.searchParams.set('since', String(Math.floor(sinceUnixSeconds)));
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
    options?: { editedAt?: Date },
  ): Promise<void> {
    for (const m of messages) {
      const ext = m.id?.trim();
      if (!ext) continue;
      const createdAt = new Date(m.created_time);
      if (Number.isNaN(createdAt.getTime())) continue;
      const senderId = m.from?.id?.trim() ?? '';
      const receiverId = m.to?.data?.[0]?.id?.trim() ?? '';
      const text = m.message ?? '';
      const { id: _messageId, ...messageWithoutId } = m;
      const instagramJson = JSON.stringify(messageWithoutId);

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
      await this.conversationMessageRepo.save(row);
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

  private async getConversationMessagesFromDb(
    conversationDbId: number,
    paging?: { page: number; pageSize: number },
  ): Promise<InstagramMessagesResponseDto> {
    const qb = this.conversationMessageRepo
      .createQueryBuilder('m')
      .where('m.conversation_id = :cid', { cid: conversationDbId })
      .orderBy('m.created_at', 'DESC')
      .addOrderBy('m.external_id', 'DESC');
    const page = paging?.page ?? 1;
    const pageSize = paging?.pageSize ?? 50;
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    const readAtNow = new Date();
    const unreadIds = rows.filter((r) => r.readAt == null).map((r) => r.externalId);
    if (unreadIds.length > 0) {
      await this.conversationMessageRepo
        .createQueryBuilder()
        .update(ConversationMessage)
        .set({ readAt: readAtNow })
        .where('external_id IN (:...ids)', { ids: unreadIds })
        .execute();
      for (const row of rows) {
        if (row.readAt == null) row.readAt = readAtNow;
      }
    }
    const data: InstagramMessageDto[] = rows.map((r) => {
      const addDbMeta = (m: InstagramMessageDto): InstagramMessageDto => ({
        ...m,
        ...(r.editedAt != null
          ? { edited_at: r.editedAt.toISOString() }
          : {}),
        ...(r.readAt != null ? { read_at: r.readAt.toISOString() } : {}),
        ...(r.repliedToExternalId != null
          ? { reply_to_id: r.repliedToExternalId }
          : {}),
        system_updated_at: r.systemUpdatedAt.toISOString(),
      });
      try {
        const parsed = JSON.parse(r.instagramJson) as Record<string, unknown>;
        const createdTime = parsed.created_time;
        if (typeof createdTime === 'string' && createdTime.length > 0) {
          return addDbMeta({
            ...(parsed as unknown as InstagramMessageDto),
            id:
              typeof parsed.id === 'string' && parsed.id.length > 0
                ? parsed.id
                : r.externalId,
          } as InstagramMessageDto);
        }
      } catch {
        /* use fallback */
      }
      return addDbMeta({
        id: r.externalId,
        created_time: r.createdAt.toISOString(),
        message: r.message,
        to: { data: r.receiverId && r.receiverId !== '0' ? [{ id: r.receiverId }] : [] },
      });
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
    const now = new Date();
    await this.conversationRepo.update(
      { id: conv.id, managerId: ownerId },
      { readAt: now },
    );
    return result;
  }

  private normalizeRecipientIdInput(
    raw: string | undefined | null,
  ): string {
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

  private async inferRecipientPsidFromDbMessages(
    conversationDbId: number,
    pageId: string,
  ): Promise<string | null> {
    const pageTrim = pageId.trim();
    const rows = await this.conversationMessageRepo.find({
      where: { conversationId: conversationDbId },
      order: { createdAt: 'DESC' },
      take: 80,
    });
    for (const r of rows) {
      try {
        const m = JSON.parse(r.instagramJson) as InstagramMessageDto;
        const fromId = m.from?.id?.trim();
        if (this.isLikelyInstagramPsid(fromId) && fromId !== pageTrim) {
          return fromId!;
        }
        for (const t of m.to?.data ?? []) {
          const tid = t.id?.trim();
          if (this.isLikelyInstagramPsid(tid) && tid !== pageTrim) {
            return tid!;
          }
        }
      } catch {
        const sid = r.senderId?.trim();
        if (this.isLikelyInstagramPsid(sid) && sid !== pageTrim) {
          return sid!;
        }
        const rid = r.receiverId?.trim();
        if (this.isLikelyInstagramPsid(rid) && rid !== pageTrim) {
          return rid!;
        }
      }
    }
    return null;
  }

  private async fetchGraphConversationParticipants(
    conversationExternalId: string,
    accessToken: string,
  ): Promise<InstagramConversationParticipantDto[]> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(conversationExternalId)}`,
    );
    url.searchParams.set(
      'fields',
      'participants{id,name,username,profile_pic}',
    );
    url.searchParams.set('access_token', accessToken);
    const body = await this.instagramGraphFetch<{
      participants?: { data?: InstagramConversationParticipantDto[] };
    }>(url);
    return body.participants?.data ?? [];
  }

  private async inferRecipientPsidFromGraphMessages(
    graphConversationId: string,
    accessToken: string,
    pageId: string,
  ): Promise<string | null> {
    const pageTrim = pageId.trim();
    const graphUrl = this.buildConversationMessagesGraphUrl(
      graphConversationId,
      accessToken,
    );
    const res =
      await this.instagramGraphFetch<InstagramMessagesResponseDto>(graphUrl);
    for (const m of res.data ?? []) {
      const fromId = m.from?.id?.trim();
      if (this.isLikelyInstagramPsid(fromId) && fromId !== pageTrim) {
        return fromId!;
      }
      for (const t of m.to?.data ?? []) {
        const tid = t.id?.trim();
        if (this.isLikelyInstagramPsid(tid) && tid !== pageTrim) {
          return tid!;
        }
      }
    }
    return null;
  }

  async sendInstagramMessageForConversation(
    ownerId: number,
    conversationIdParam: string,
    message: string,
    recipientIdOverride?: string,
  ): Promise<SendInstagramMessageResponseDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const accessToken = await this.resolveGraphAccessToken(company.id);
    const conv = await this.requireConversationForOwnerFromParam(
      ownerId,
      conversationIdParam,
    );

    const pageId = company.pageId?.trim() ?? '';
    const override = this.normalizeRecipientIdInput(recipientIdOverride);

    let recipient: string;
    if (override.length > 0) {
      if (!this.isLikelyInstagramPsid(override)) {
        throw new BadRequestException(
          'recipientId must be digits only (Instagram PSID). Spaces, commas, and quotes are stripped; omit recipientId to resolve from the conversation.',
        );
      }
      recipient = override;
    } else {
      const stored = conv.participantId?.trim() ?? '';
      if (this.isLikelyInstagramPsid(stored)) {
        recipient = stored;
      } else {
        const ext = conv.externalId?.trim();
        if (!ext) {
          throw new BadRequestException(
            'Conversation is missing external_id; run POST /conversations/sync first.',
          );
        }
        const fromDb = await this.inferRecipientPsidFromDbMessages(conv.id, pageId);
        const fromParticipants = this.pickCustomerParticipantId(
          await this.fetchGraphConversationParticipants(ext, accessToken),
          pageId,
        );
        const fromGraphConv =
          this.isLikelyInstagramPsid(fromParticipants) &&
          fromParticipants !== 'unknown'
            ? fromParticipants
            : null;
        const fromMsgs = await this.inferRecipientPsidFromGraphMessages(
          ext,
          accessToken,
          pageId,
        );
        const resolved = fromDb ?? fromGraphConv ?? fromMsgs;
        if (!resolved || !this.isLikelyInstagramPsid(resolved)) {
          throw new BadRequestException(
            'Could not resolve recipient PSID. Pass recipientId (numeric id) in the body, run POST /conversations/sync, or fetch messages so participants can be inferred.',
          );
        }
        recipient = resolved;
        if (conv.participantId !== resolved) {
          conv.participantId = resolved;
          await this.conversationRepo.save(conv);
        }
      }
    }

    const text = message.trim();
    if (!text) {
      throw new BadRequestException('message must not be empty');
    }

    const url = new URL('https://graph.facebook.com/v25.0/me/messages');
    url.searchParams.set('access_token', accessToken);

    const result = await this.instagramGraphFetch<SendInstagramMessageResponseDto>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipient },
          message: { text: text },
          messaging_type: 'RESPONSE',
        }),
      },
    );

    const maybeError = result as unknown as InstagramErrorResponse;
    if (maybeError.error?.message) {
      throw new BadGatewayException(maybeError.error.message);
    }

    return result;
  }

  private async resolveGraphAccessToken(companyId: number): Promise<string> {
    const source = await this.sourceRepo.findOne({
      where: { companyId },
      order: { id: 'DESC' },
    });
    const fromSource = source?.token?.trim();
    if (fromSource) return fromSource;

    const fromEnv = this.config.get<string>('INSTAGRAM_ACCESS_TOKEN')?.trim();
    if (fromEnv) return fromEnv;

    throw new ServiceUnavailableException(
      'No source token found for company and INSTAGRAM_ACCESS_TOKEN is not configured',
    );
  }

  private pickCustomerParticipantId(
    participants: InstagramConversationParticipantDto[],
    pageId: string,
  ): string {
    const ids = participants
      .map((p) => p.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return 'unknown';
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
      'id,updated_time,participants{id,name,username,profile_pic},unread_count,message_count';
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
    url.searchParams.set('fields', 'profile_pic');
    url.searchParams.set('access_token', accessToken);
    try {
      const body = await this.instagramGraphFetch<{ profile_pic?: string }>(url);
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
      field: 'page' | 'pageSize',
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

    const page = parseIntStrict(pageRaw, 'page', 1);
    const pageSize = parseIntStrict(pageSizeRaw, 'pageSize', 50);
    const maxPageSize = 200;
    if (pageSize > maxPageSize) {
      throw new BadRequestException(`pageSize must be <= ${maxPageSize}`);
    }
    return { page, pageSize };
  }

  private async requireCompanyForOwner(ownerId: number): Promise<Company> {
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: 'DESC' },
    });
    if (!company) {
      throw new NotFoundException('Company not found for current user');
    }
    return company;
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
          'In developers.facebook.com: add “pages_messaging” (and Instagram messaging scopes your product needs) to the app, ' +
          're-run Login / Page install so the Page token includes those permissions, then store the new token for this company (or Sources / env).',
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
        throw new BadGatewayException('Instagram Graph API returned invalid JSON');
      }
    }

    this.throwIfInstagramGraphFailure(response.ok, response.status, body);

    return body as T;
  }
}
