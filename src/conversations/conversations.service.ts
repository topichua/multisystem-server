import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company,
  Conversation,
  ConversationSource,
  Source,
} from '../database/entities';
import type {
  InstagramConversationDto,
  InstagramConversationParticipantDto,
  InstagramConversationsResponseDto,
} from './dto/http/instagram-conversations-response.dto';
import type { InstagramMessagesResponseDto } from './dto/http/instagram-messages-response.dto';
import type { SendInstagramMessageResponseDto } from './dto/http/send-instagram-message-response.dto';
import type { ConversationRowDto } from './dto/http/conversations-list-response.dto';

type InstagramErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
  ) {}

  async listConversationsForOwner(ownerId: number): Promise<{
    items: ConversationRowDto[];
  }> {
    await this.requireCompanyForOwner(ownerId);
    const rows = await this.conversationRepo.find({
      where: { managerId: ownerId },
      order: { instUpdatedAt: 'DESC' },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        externalSourceId: r.externalSourceId,
        externalId: r.externalId,
        instUpdatedAt: r.instUpdatedAt,
        readAt: r.readAt,
        participantId: r.participantId,
        source: r.source,
        groupId: r.groupId,
      })),
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

  async getInstagramMessagesForConversation(
    ownerId: number,
    conversationId: string,
  ): Promise<InstagramMessagesResponseDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const accessToken = await this.resolveGraphAccessToken(company.id);

    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(conversationId)}/messages`,
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
        'shares{data{id,name,description,type,url,link,template}}',
        'story{mention{id,link}}',
        'reactions{data{reaction,users{id,username}}}',
        'tags{data{name}}',
      ].join(','),
    );
    url.searchParams.set('access_token', accessToken);

    return this.instagramGraphFetch<InstagramMessagesResponseDto>(url);
  }

  async sendInstagramMessageForConversation(
    ownerId: number,
    recipientId: string,
    message: string,
  ): Promise<SendInstagramMessageResponseDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const accessToken = await this.resolveGraphAccessToken(company.id);

    const url = new URL('https://graph.facebook.com/v25.0/me/messages');
    url.searchParams.set('access_token', accessToken);

    const result = await this.instagramGraphFetch<SendInstagramMessageResponseDto>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
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
   * requested. Resolve it via the scoped-user node (same as User Profile API).
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

    if (!response.ok) {
      const message =
        (body as InstagramErrorResponse).error?.message ??
        `Instagram Graph API request failed with status ${response.status}`;
      throw new BadGatewayException(message);
    }

    return body as T;
  }
}
