import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository, SelectQueryBuilder } from "typeorm";
import {
  ConversationMessage,
  ConversationMessageType,
  InstagramIntegration,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { InstagramIntegrationsListResponseDto } from "./dto/instagram-integration-list-item.dto";
import { InstagramIntegrationProfileService } from "./instagram-integration-profile.service";
import { instagramGraphUrl } from "./instagram-graph.util";
import { InstagramUsersService } from "./instagram-users.service";
import type { ListInstagramMediaQueryDto } from "./dto/list-instagram-media-query.dto";
import type {
  InstagramMediaItemDto,
  InstagramMediaListResponseDto,
  InstagramMediaPagingDto,
} from "./dto/instagram-media-response.dto";
import type {
  InstagramCommentDto,
  InstagramPostCommentsListResponseDto,
} from "./dto/instagram-post-comments-response.dto";
import type { ListInstagramCommentRepliesQueryDto } from "./dto/list-instagram-comment-replies-query.dto";
import type { ListInstagramPostCommentsQueryDto } from "./dto/list-instagram-post-comments-query.dto";
import type { ReplyInstagramCommentQueryDto } from "./dto/reply-instagram-comment.dto";
import type { ReplyInstagramCommentResponseDto } from "./dto/reply-instagram-comment-response.dto";

const IG_MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp," +
  "like_count,comments_count," +
  "children{id,media_type,media_url,thumbnail_url}";

type CommentListCursor = { t: string; id: string };

type InstagramErrorResponse = {
  error?: { message?: string; type?: string; code?: number };
};

type IgMediaPaging = {
  cursors?: { before?: string; after?: string };
  next?: string;
  previous?: string;
};

type IgMediaListResponse = {
  data?: InstagramMediaItemDto[];
  paging?: IgMediaPaging;
};

/** Single IG Media node from Graph `GET /{media-id}?fields=...`. */
export type InstagramGraphMediaDetail = {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  shortcode?: string;
  children?: {
    data?: Array<{
      id?: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      permalink?: string;
    }>;
  };
};

@Injectable()
export class InstagramService {
  constructor(
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly integrationProfile: InstagramIntegrationProfileService,
    private readonly instagramUsers: InstagramUsersService,
  ) {}

  /** Connected Instagram integrations for the workspace. */
  async listIntegrationsForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<InstagramIntegrationsListResponseDto> {
    const workspaceId = await this.workspaceContext.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );
    const rows = await this.instagramIntegrationRepo.find({
      where: { workspaceId, accessToken: Not(IsNull()) },
      order: { id: "ASC" },
    });
    return {
      data: await this.integrationProfile.mapRows(rows),
    };
  }

  /**
   * Lists one page of Instagram feed media for the connected Business/Creator account
   * (Graph `GET /{ig-user-id}/media`), using cursor paging (`after` / `before`).
   */
  async listMediaForOwner(
    ownerId: number,
    query: ListInstagramMediaQueryDto = {},
  ): Promise<InstagramMediaListResponseDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(
        ownerId,
        undefined,
        query.integrationId,
      );
    const igUserId = integration.instagramAccountId?.trim();
    if (!igUserId) {
      throw new BadRequestException(
        "No Instagram Business account on this integration. Connect Instagram to your Facebook Page and complete OAuth so instagram_account_id is set.",
      );
    }
    const accessToken = await this.resolveGraphAccessToken(integration.id);

    const url = new URL(
      instagramGraphUrl(`${encodeURIComponent(igUserId)}/media`),
    );
    url.searchParams.set("fields", IG_MEDIA_FIELDS);
    url.searchParams.set("limit", String(query.limit ?? 25));
    url.searchParams.set("access_token", accessToken);
    if (query.after?.trim()) {
      url.searchParams.set("after", query.after.trim());
    }
    if (query.before?.trim()) {
      url.searchParams.set("before", query.before.trim());
    }

    const mediaPage = await this.instagramGraphFetch<IgMediaListResponse>(url);

    return {
      data: (mediaPage.data ?? []).map((item) => this.normalizeMediaItem(item)),
      paging: this.mapMediaPaging(mediaPage.paging),
    };
  }

  /**
   * Lists one page of top-level comments on an Instagram media post
   * from `conversation_messages` (`social_media_id` = media id).
   */
  async listCommentsForPostForOwner(
    ownerId: number,
    mediaId: string,
    query: ListInstagramPostCommentsQueryDto = {},
  ): Promise<InstagramPostCommentsListResponseDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(
        ownerId,
        undefined,
        query.integrationId,
      );
    const includeReplies = query.include_replies === true;
    const limit = query.limit ?? 25;
    const after = this.decodeCommentCursor(query.after);
    const before = this.decodeCommentCursor(query.before);
    if (query.after?.trim() && !after) {
      throw new BadRequestException("after is invalid");
    }
    if (query.before?.trim() && !before) {
      throw new BadRequestException("before is invalid");
    }

    const qb = this.storedCommentsQuery(integration.workspaceId, mediaId).andWhere(
      this.topLevelCommentSql(),
      { mediaId },
    );
    const direction = this.applyCommentKeyset(qb, { after, before, limit });
    const fetched = await qb.getMany();
    const { rows, paging } = this.sliceCommentPage(fetched, {
      limit,
      direction,
      after,
      before,
    });

    const parentIds = rows.map((row) => this.commentIdOf(row)).filter(Boolean);
    const replyCountByParent = new Map<string, number>();
    const repliesByParent = new Map<string, ConversationMessage[]>();

    if (parentIds.length > 0) {
      if (includeReplies) {
        const replyRows = await this.storedCommentsQuery(
          integration.workspaceId,
          mediaId,
        )
          .andWhere("m.replied_to_external_id IN (:...parentIds)", { parentIds })
          .andWhere(this.replyCommentSql(), { mediaId })
          .orderBy("m.created_at", "ASC")
          .addOrderBy("m.external_id", "ASC")
          .getMany();
        for (const reply of replyRows) {
          const parentId = reply.repliedToExternalId?.trim();
          if (!parentId) continue;
          const list = repliesByParent.get(parentId) ?? [];
          list.push(reply);
          repliesByParent.set(parentId, list);
          replyCountByParent.set(parentId, list.length);
        }
      } else {
        const counts = await this.storedCommentsQuery(
          integration.workspaceId,
          mediaId,
        )
          .select("m.replied_to_external_id", "parent_id")
          .addSelect("COUNT(*)", "cnt")
          .andWhere("m.replied_to_external_id IN (:...parentIds)", { parentIds })
          .andWhere(this.replyCommentSql(), { mediaId })
          .groupBy("m.replied_to_external_id")
          .getRawMany<{ parent_id: string; cnt: string | number }>();
        for (const row of counts) {
          const parentId = row.parent_id?.trim();
          if (!parentId) continue;
          replyCountByParent.set(parentId, Number(row.cnt) || 0);
        }
      }
    }

    const normalized = rows.map((row) => {
      const id = this.commentIdOf(row);
      const replyCount = replyCountByParent.get(id) ?? 0;
      const nested =
        includeReplies
          ? (repliesByParent.get(id) ?? []).map((reply) =>
              this.mapStoredComment(reply),
            )
          : undefined;
      return this.mapStoredComment(row, {
        reply_count: replyCount,
        has_replies: replyCount > 0,
        ...(nested && nested.length > 0 ? { replies: nested } : {}),
      });
    });
    const data = await this.enrichCommentsWithUsers(
      normalized,
      integration.workspaceId,
    );

    return { data, paging };
  }

  /**
   * Lists one page of replies on a top-level comment from `conversation_messages`.
   */
  async listRepliesForCommentForOwner(
    ownerId: number,
    mediaId: string,
    commentId: string,
    query: ListInstagramCommentRepliesQueryDto = {},
  ): Promise<InstagramPostCommentsListResponseDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(
        ownerId,
        undefined,
        query.integrationId,
      );
    const limit = query.limit ?? 25;
    const after = this.decodeCommentCursor(query.after);
    const before = this.decodeCommentCursor(query.before);
    if (query.after?.trim() && !after) {
      throw new BadRequestException("after is invalid");
    }
    if (query.before?.trim() && !before) {
      throw new BadRequestException("before is invalid");
    }

    const qb = this.storedCommentsQuery(integration.workspaceId, mediaId)
      .andWhere("m.replied_to_external_id = :commentId", { commentId })
      .andWhere(this.replyCommentSql(), { mediaId });
    const direction = this.applyCommentKeyset(qb, { after, before, limit });
    const fetched = await qb.getMany();
    const { rows, paging } = this.sliceCommentPage(fetched, {
      limit,
      direction,
      after,
      before,
    });

    const normalized = rows.map((row) => this.mapStoredComment(row));
    const data = await this.enrichCommentsWithUsers(
      normalized,
      integration.workspaceId,
    );

    return { data, paging };
  }

  /**
   * Creates a reply on a top-level comment
   * (Graph `POST /{ig-comment-id}/replies`).
   */
  async replyToCommentForOwner(
    ownerId: number,
    commentId: string,
    message: string,
    query: ReplyInstagramCommentQueryDto = {},
  ): Promise<ReplyInstagramCommentResponseDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(
        ownerId,
        undefined,
        query.integrationId,
      );
    const accessToken = await this.resolveGraphAccessToken(integration.id);
    const text = message.trim();
    if (!text) {
      throw new BadRequestException("message must not be empty");
    }

    const url = new URL(
      instagramGraphUrl(`${encodeURIComponent(commentId)}/replies`),
    );
    url.searchParams.set("access_token", accessToken);

    const result =
      await this.instagramGraphFetch<ReplyInstagramCommentResponseDto>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

    const createdId = result.id?.trim();
    if (!createdId) {
      throw new BadGatewayException(
        "Instagram Graph API did not return a reply comment id",
      );
    }

    return { id: createdId };
  }

  private mapMediaPaging(
    paging?: IgMediaPaging,
  ): InstagramMediaPagingDto | undefined {
    if (!paging) {
      return undefined;
    }

    const before = paging.cursors?.before?.trim();
    const after = paging.cursors?.after?.trim();
    const hasNext = Boolean(paging.next ?? after);
    const hasPrevious = Boolean(paging.previous ?? before);

    if (!before && !after && !hasNext && !hasPrevious) {
      return undefined;
    }

    return {
      ...(before || after
        ? {
            cursors: {
              ...(before ? { before } : {}),
              ...(after ? { after } : {}),
            },
          }
        : {}),
      has_next: hasNext,
      has_previous: hasPrevious,
    };
  }

  /**
   * Loads one media object by Graph id (same token as /media). Caller must use an id
   * the Page token can read (e.g. from your account’s media list).
   */
  async fetchMediaByIdForOwner(
    ownerId: number,
    mediaId: string,
    integrationId?: number,
  ): Promise<{ detail: InstagramGraphMediaDetail; accessToken: string }> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(
        ownerId,
        undefined,
        integrationId,
      );
    const accessToken = await this.resolveGraphAccessToken(integration.id);
    const fields =
      "caption,media_type,media_url,thumbnail_url,permalink,shortcode," +
      "children{id,media_type,media_url,thumbnail_url,permalink}";
    const url = new URL(
      instagramGraphUrl(encodeURIComponent(mediaId)),
    );
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);
    const detail =
      await this.instagramGraphFetch<InstagramGraphMediaDetail>(url);
    return { detail, accessToken };
  }

  /** Download a CDN URL returned by Graph (appends access_token if missing). */
  async downloadMediaBinary(
    accessToken: string,
    assetUrl: string,
  ): Promise<{
    buffer: Buffer;
    contentType: string;
  }> {
    const u = new URL(assetUrl);
    if (!u.searchParams.has("access_token")) {
      u.searchParams.set("access_token", accessToken);
    }
    const res = await fetch(u.toString());
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new BadGatewayException(
        `Failed to download Instagram media asset (HTTP ${res.status}): ${t.slice(0, 240)}`,
      );
    }
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, contentType };
  }

  private normalizeMediaItem(
    raw: InstagramMediaItemDto,
  ): InstagramMediaItemDto {
    const childrenRaw = (
      raw as { children?: { data?: InstagramMediaItemDto[] } }
    ).children?.data;
    const children =
      childrenRaw?.map((c) => ({
        id: c.id ?? "",
        media_type: c.media_type,
        media_url: c.media_url,
        thumbnail_url: c.thumbnail_url,
      })) ?? undefined;

    const tags = this.hashtagsFromCaption(raw.caption);

    return {
      id: raw.id ?? "",
      caption: raw.caption,
      media_type: raw.media_type,
      media_url: raw.media_url,
      permalink: raw.permalink,
      thumbnail_url: raw.thumbnail_url,
      timestamp: raw.timestamp,
      like_count: raw.like_count,
      comments_count: raw.comments_count,
      ...(tags ? { tags } : {}),
      ...(children && children.length > 0 ? { children } : {}),
    };
  }

  /** Hashtags from caption (Graph does not return a dedicated hashtag field). */
  private hashtagsFromCaption(
    caption: string | undefined,
  ): string[] | undefined {
    if (!caption?.trim()) return undefined;
    const matches = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    const unique = [...new Set(matches.map((m) => m.slice(1)))];
    return unique.length > 0 ? unique : undefined;
  }

  private async enrichCommentsWithUsers(
    comments: InstagramCommentDto[],
    workspaceId: number,
  ): Promise<InstagramCommentDto[]> {
    const authorIds = this.collectCommentAuthorIds(comments);
    if (authorIds.length === 0) {
      return comments;
    }

    const userById = await this.instagramUsers.getMapByIds(
      workspaceId,
      authorIds,
    );

    return comments.map((comment) =>
      this.enrichCommentWithUser(comment, userById),
    );
  }

  private collectCommentAuthorIds(comments: InstagramCommentDto[]): string[] {
    const ids: string[] = [];
    const visit = (comment: InstagramCommentDto) => {
      const authorId = comment.from?.id?.trim();
      if (authorId) {
        ids.push(authorId);
      }
      for (const reply of comment.replies ?? []) {
        visit(reply);
      }
    };
    for (const comment of comments) {
      visit(comment);
    }
    return ids;
  }

  private enrichCommentWithUser(
    comment: InstagramCommentDto,
    userById: Map<
      string,
      { id: string; name: string; username: string; profilePic: string }
    >,
  ): InstagramCommentDto {
    const authorId = comment.from?.id?.trim();
    const user = authorId ? userById.get(authorId) : undefined;
    const from = comment.from
      ? {
          ...comment.from,
          ...(user?.username ? { username: user.username } : {}),
          ...(user?.name ? { name: user.name } : {}),
          ...(user?.profilePic?.trim()
            ? { profilePic: user.profilePic.trim() }
            : {}),
        }
      : undefined;

    const replies =
      comment.replies?.map((reply) =>
        this.enrichCommentWithUser(reply, userById),
      ) ?? undefined;

    return {
      ...comment,
      ...(from ? { from } : {}),
      username: comment.username ?? from?.username ?? user?.username,
      ...(replies ? { replies } : {}),
    };
  }

  private storedCommentsQuery(
    workspaceId: number,
    mediaId: string,
  ): SelectQueryBuilder<ConversationMessage> {
    return this.conversationMessageRepo
      .createQueryBuilder("m")
      .where("m.workspace_id = :workspaceId", { workspaceId })
      .andWhere("m.social_media_id = :mediaId", { mediaId })
      .andWhere("m.type = :type", {
        type: ConversationMessageType.instagram_comment,
      })
      .andWhere("m.deleted_at IS NULL");
  }

  /** Top-level comments: no parent, or parent is the media/post id (Instagram webhook). */
  private topLevelCommentSql(): string {
    return `(m.replied_to_external_id IS NULL OR m.replied_to_external_id = m.social_media_id OR m.replied_to_external_id = :mediaId)`;
  }

  private replyCommentSql(): string {
    return `(m.replied_to_external_id IS NOT NULL AND m.replied_to_external_id <> m.social_media_id AND m.replied_to_external_id <> :mediaId)`;
  }

  private applyCommentKeyset(
    qb: SelectQueryBuilder<ConversationMessage>,
    params: {
      after?: CommentListCursor | null;
      before?: CommentListCursor | null;
      limit: number;
    },
  ): "desc" | "asc" {
    const idExpr = "m.external_id";
    const goingBack = Boolean(params.before) && !params.after;
    if (goingBack && params.before) {
      qb.andWhere(
        `(m.created_at > :cursorAt OR (m.created_at = :cursorAt AND ${idExpr} > :cursorId))`,
        { cursorAt: params.before.t, cursorId: params.before.id },
      );
      qb.orderBy("m.created_at", "ASC").addOrderBy(idExpr, "ASC");
      qb.take(params.limit + 1);
      return "asc";
    }
    if (params.after) {
      qb.andWhere(
        `(m.created_at < :cursorAt OR (m.created_at = :cursorAt AND ${idExpr} < :cursorId))`,
        { cursorAt: params.after.t, cursorId: params.after.id },
      );
    }
    qb.orderBy("m.created_at", "DESC").addOrderBy(idExpr, "DESC");
    qb.take(params.limit + 1);
    return "desc";
  }

  private sliceCommentPage(
    fetched: ConversationMessage[],
    params: {
      limit: number;
      direction: "desc" | "asc";
      after?: CommentListCursor | null;
      before?: CommentListCursor | null;
    },
  ): {
    rows: ConversationMessage[];
    paging: InstagramMediaPagingDto | undefined;
  } {
    const hasMore = fetched.length > params.limit;
    const sliced = hasMore ? fetched.slice(0, params.limit) : fetched;
    const rows =
      params.direction === "asc" ? [...sliced].reverse() : sliced;

    if (rows.length === 0) {
      return { rows, paging: undefined };
    }

    const first = this.encodeCommentCursor(rows[0]);
    const last = this.encodeCommentCursor(rows[rows.length - 1]);
    const goingBack = Boolean(params.before) && !params.after;
    const hasNext = goingBack ? true : hasMore;
    const hasPrevious = goingBack ? hasMore : Boolean(params.after);

    return {
      rows,
      paging: {
        cursors: {
          ...(first ? { before: first } : {}),
          ...(last ? { after: last } : {}),
        },
        has_next: hasNext,
        has_previous: hasPrevious,
      },
    };
  }

  private commentIdOf(row: ConversationMessage): string {
    return (row.commentId ?? row.externalId)?.trim() ?? "";
  }

  private encodeCommentCursor(row: ConversationMessage): string {
    return Buffer.from(
      `${row.createdAt.toISOString()}|${row.externalId}`,
      "utf8",
    ).toString("base64url");
  }

  private decodeCommentCursor(raw?: string): CommentListCursor | null {
    if (!raw?.trim()) return null;
    try {
      const decoded = Buffer.from(raw.trim(), "base64url").toString("utf8");
      const sep = decoded.indexOf("|");
      if (sep <= 0) return null;
      const t = decoded.slice(0, sep);
      const id = decoded.slice(sep + 1).trim();
      if (!id || Number.isNaN(Date.parse(t))) return null;
      return { t, id };
    } catch {
      return null;
    }
  }

  private mapStoredComment(
    row: ConversationMessage,
    extras: {
      reply_count?: number;
      has_replies?: boolean;
      replies?: InstagramCommentDto[];
    } = {},
  ): InstagramCommentDto {
    const fromParsed = this.parseStoredCommentFrom(row);
    const authorId = fromParsed.id || row.senderId?.trim() || "";
    const username = fromParsed.username;
    return {
      id: this.commentIdOf(row),
      text: row.message,
      timestamp: row.createdAt.toISOString(),
      ...(username ? { username } : {}),
      ...(authorId
        ? {
            from: {
              id: authorId,
              ...(username ? { username } : {}),
            },
          }
        : {}),
      ...extras,
    };
  }

  private parseStoredCommentFrom(row: ConversationMessage): {
    id?: string;
    username?: string;
  } {
    try {
      const parsed = JSON.parse(row.instagramJson) as {
        from?: { id?: string; username?: string };
        webhook_comment?: { from?: { id?: string; username?: string } };
      };
      const from = parsed.from ?? parsed.webhook_comment?.from;
      const id = from?.id?.trim();
      const username = from?.username?.trim();
      return {
        ...(id ? { id } : {}),
        ...(username ? { username } : {}),
      };
    } catch {
      return {};
    }
  }

  private async resolveGraphAccessToken(companyId: number): Promise<string> {
    const integration = await this.instagramIntegrationRepo.findOne({
      where: { id: companyId },
    });
    const pageToken = integration?.accessToken?.trim();
    if (pageToken) return pageToken;

    throw new ServiceUnavailableException(
      "No Page Graph token: complete Facebook Login for this workspace so integration.access_token is set.",
    );
  }

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
        "Facebook / Instagram access token is missing required Page permissions (Graph error #230). " +
          "Re-authorize the app with the scopes your product needs, then update the integration token.",
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
