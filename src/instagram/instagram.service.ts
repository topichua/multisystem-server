import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import { InstagramIntegration } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { InstagramIntegrationsListResponseDto } from "./dto/instagram-integration-list-item.dto";
import type { ListInstagramMediaQueryDto } from "./dto/list-instagram-media-query.dto";
import type {
  InstagramMediaItemDto,
  InstagramMediaListResponseDto,
  InstagramMediaPagingDto,
} from "./dto/instagram-media-response.dto";

const GRAPH_VERSION = "v25.0";

const IG_MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp," +
  "like_count,comments_count," +
  "children{id,media_type,media_url,thumbnail_url}";

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
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  /** Connected Instagram integrations for the workspace (`id` + display `name`). */
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
      data: rows.map((row) => {
        const businessAccountId = row.instagramAccountId?.trim();
        return {
          id: row.id,
          name: this.integrationDisplayName(row),
          ...(businessAccountId ? { businessAccountId } : {}),
        };
      }),
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
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media`,
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

    const mediaPage =
      await this.instagramGraphFetch<IgMediaListResponse>(url);

    return {
      data: (mediaPage.data ?? []).map((item) => this.normalizeMediaItem(item)),
      paging: this.mapMediaPaging(mediaPage.paging),
    };
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
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`,
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

  private integrationDisplayName(row: InstagramIntegration): string {
    return (
      row.facebookPageName?.trim() ||
      row.name?.trim() ||
      `Instagram #${row.id}`
    );
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
