import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../database/entities";
import type { InstagramMediaItemDto } from "./dto/instagram-media-response.dto";

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
  children?: {
    data?: Array<{
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  };
};

@Injectable()
export class InstagramService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  /**
   * Lists all Instagram feed media for the connected Business/Creator account
   * (Graph `GET /{ig-user-id}/media`), using the Page access token on the owner’s integration.
   */
  async listMediaForOwner(
    ownerId: number,
  ): Promise<{ data: InstagramMediaItemDto[] }> {
    const company = await this.requireCompanyForOwner(ownerId);
    const igUserId = company.instagramAccountId?.trim();
    if (!igUserId) {
      throw new BadRequestException(
        "No Instagram Business account on this integration. Connect Instagram to your Facebook Page and complete OAuth so instagram_account_id is set.",
      );
    }
    const accessToken = await this.resolveGraphAccessToken(company.id);

    const out: InstagramMediaItemDto[] = [];
    let nextUrl: string | null =
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media` +
      `?fields=${encodeURIComponent(IG_MEDIA_FIELDS)}` +
      `&limit=100` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    while (nextUrl) {
      const mediaPage: IgMediaListResponse =
        await this.instagramGraphFetch<IgMediaListResponse>(new URL(nextUrl));
      const batch = mediaPage.data ?? [];
      for (const item of batch) {
        out.push(this.normalizeMediaItem(item));
      }
      nextUrl = mediaPage.paging?.next ?? null;
    }

    return { data: out };
  }

  /**
   * Loads one media object by Graph id (same token as /media). Caller must use an id
   * the Page token can read (e.g. from your account’s media list).
   */
  async fetchMediaByIdForOwner(
    ownerId: number,
    mediaId: string,
  ): Promise<{ detail: InstagramGraphMediaDetail; accessToken: string }> {
    const company = await this.requireCompanyForOwner(ownerId);
    const accessToken = await this.resolveGraphAccessToken(company.id);
    const fields =
      "caption,media_type,media_url,thumbnail_url,permalink,children{media_type,media_url,thumbnail_url}";
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
  private hashtagsFromCaption(caption: string | undefined): string[] | undefined {
    if (!caption?.trim()) return undefined;
    const matches = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    const unique = [...new Set(matches.map((m) => m.slice(1)))];
    return unique.length > 0 ? unique : undefined;
  }

  private async resolveGraphAccessToken(companyId: number): Promise<string> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    const pageToken = company?.accessToken?.trim();
    if (pageToken) return pageToken;

    throw new ServiceUnavailableException(
      "No Page Graph token: complete Facebook Login for this workspace so integration.access_token is set.",
    );
  }

  private async requireCompanyForOwner(ownerId: number): Promise<Company> {
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!company) {
      throw new NotFoundException("Company not found for current user");
    }
    return company;
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
