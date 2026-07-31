import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  TikTokIntegration,
  TIKTOK_INTEGRATION_PROVIDER,
} from "../database/entities/tiktok-integration.entity";
import { CredentialsEncryptionService } from "../payments/encryption/credentials-encryption.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { ListTikTokCommentsQueryDto } from "./dto/list-tiktok-comments-query.dto";
import type { ListTikTokVideosQueryDto } from "./dto/list-tiktok-videos-query.dto";
import type {
  TikTokCommentDto,
  TikTokCommentsListResponseDto,
} from "./dto/tiktok-comments-response.dto";
import type {
  TikTokVideoDto,
  TikTokVideosListResponseDto,
} from "./dto/tiktok-videos-response.dto";

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const VIDEO_LIST_URL = "https://open.tiktokapis.com/v2/video/list/";
const COMMENT_LIST_URL = "https://open.tiktokapis.com/v2/video/comment/list/";

const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "create_time",
  "cover_image_url",
  "share_url",
  "duration",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
].join(",");

const COMMENT_FIELDS = [
  "id",
  "video_id",
  "text",
  "like_count",
  "reply_count",
  "parent_comment_id",
  "create_time",
].join(",");

/** Refresh a few minutes before expiry. */
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

type TikTokErrorBody = {
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
  error_description?: string;
  log_id?: string;
};

type TikTokTokenRefreshResponse = TikTokErrorBody & {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  open_id?: string;
  token_type?: string;
};

type TikTokVideoListResponse = TikTokErrorBody & {
  data?: {
    videos?: Array<Record<string, unknown>>;
    cursor?: number;
    has_more?: boolean;
  };
};

type TikTokCommentListResponse = TikTokErrorBody & {
  data?: {
    comments?: Array<Record<string, unknown>>;
    cursor?: number;
    has_more?: boolean;
  };
};

@Injectable()
export class TikTokService {
  private readonly log = new Logger(TikTokService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: CredentialsEncryptionService,
    private readonly workspaceContext: WorkspaceAccessContextService,
    @InjectRepository(TikTokIntegration)
    private readonly tiktokRepo: Repository<TikTokIntegration>,
  ) {}

  /**
   * Lists the owner's public TikTok videos (`POST /v2/video/list/`).
   * Requires OAuth scope `video.list`.
   */
  async listVideosForOwner(
    ownerId: number,
    query: ListTikTokVideosQueryDto = {},
  ): Promise<TikTokVideosListResponseDto> {
    const integration = await this.requireConnectedIntegrationForOwner(
      ownerId,
      query.integrationId,
    );
    const accessToken = await this.resolveAccessToken(integration);

    const body: Record<string, unknown> = {
      max_count: query.maxCount ?? 20,
    };
    if (query.cursor != null) {
      body.cursor = query.cursor;
    }

    const url = new URL(VIDEO_LIST_URL);
    url.searchParams.set("fields", VIDEO_FIELDS);

    const json = await this.tikTokJson<TikTokVideoListResponse>(
      url.toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      "video.list",
    );

    return {
      data: (json.data?.videos ?? []).map((raw) => this.mapVideo(raw)),
      ...(json.data?.cursor != null ? { cursor: Number(json.data.cursor) } : {}),
      ...(typeof json.data?.has_more === "boolean"
        ? { hasMore: json.data.has_more }
        : {}),
      integrationId: integration.id,
    };
  }

  /**
   * Lists comments on one of the owner's TikTok videos
   * (`GET /v2/video/comment/list/`). Requires OAuth scope `comment.list`.
   */
  async listCommentsForOwner(
    ownerId: number,
    videoIdRaw: string,
    query: ListTikTokCommentsQueryDto = {},
  ): Promise<TikTokCommentsListResponseDto> {
    const videoId = videoIdRaw?.trim();
    if (!videoId || videoId.length > 64) {
      throw new BadRequestException("videoId is required");
    }

    const integration = await this.requireConnectedIntegrationForOwner(
      ownerId,
      query.integrationId,
    );
    const accessToken = await this.resolveAccessToken(integration);

    const url = new URL(COMMENT_LIST_URL);
    url.searchParams.set("fields", COMMENT_FIELDS);
    url.searchParams.set("video_id", videoId);
    url.searchParams.set("max_count", String(query.maxCount ?? 20));
    if (query.cursor != null) {
      url.searchParams.set("cursor", String(query.cursor));
    }

    let json: TikTokCommentListResponse;
    try {
      json = await this.tikTokJson<TikTokCommentListResponse>(
        url.toString(),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        "comment.list",
      );
    } catch (err) {
      // Some TikTok app configs expect POST + JSON body instead of GET.
      if (!(err instanceof BadGatewayException)) {
        throw err;
      }
      this.log.warn(
        `TikTok comment.list GET failed; retrying as POST (${err.message})`,
      );
      const postUrl = new URL(COMMENT_LIST_URL);
      postUrl.searchParams.set("fields", COMMENT_FIELDS);
      const postBody: Record<string, unknown> = {
        video_id: this.parseVideoIdForBody(videoId),
        max_count: query.maxCount ?? 20,
      };
      if (query.cursor != null) {
        postBody.cursor = query.cursor;
      }
      json = await this.tikTokJson<TikTokCommentListResponse>(
        postUrl.toString(),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postBody),
        },
        "comment.list",
      );
    }

    return {
      data: (json.data?.comments ?? []).map((raw) => this.mapComment(raw)),
      ...(json.data?.cursor != null ? { cursor: Number(json.data.cursor) } : {}),
      ...(typeof json.data?.has_more === "boolean"
        ? { hasMore: json.data.has_more }
        : {}),
      videoId,
      integrationId: integration.id,
    };
  }

  private parseVideoIdForBody(videoId: string): string | number {
    if (/^\d+$/.test(videoId) && videoId.length <= 16) {
      return Number(videoId);
    }
    // Large int64 ids stay as strings to avoid JS precision loss.
    return videoId;
  }

  private async requireConnectedIntegrationForOwner(
    ownerId: number,
    integrationId?: number,
  ): Promise<TikTokIntegration> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException("owner id must be a positive integer");
    }

    if (integrationId != null) {
      if (!Number.isInteger(integrationId) || integrationId <= 0) {
        throw new BadRequestException(
          "integrationId must be a positive integer",
        );
      }
      const row = await this.tiktokRepo.findOne({
        where: { id: integrationId, ownerId, status: "CONNECTED" },
      });
      if (!row) {
        throw new NotFoundException("TikTok integration not found");
      }
      await this.workspaceContext.requireWorkspaceOwner(
        ownerId,
        row.workspaceId,
      );
      return row;
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.tiktokRepo.findOne({
      where: {
        workspaceId: workspace.id,
        ownerId,
        status: "CONNECTED",
        provider: TIKTOK_INTEGRATION_PROVIDER,
      },
      order: { id: "DESC" },
    });
    if (!row) {
      throw new NotFoundException(
        "No connected TikTok integration. Connect via POST /integrations first.",
      );
    }
    return row;
  }

  private async resolveAccessToken(
    integration: TikTokIntegration,
  ): Promise<string> {
    const expiresAt = integration.accessTokenExpiresAt?.getTime() ?? 0;
    const needsRefresh =
      !expiresAt || expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS;

    if (needsRefresh && integration.refreshTokenEncrypted?.trim()) {
      try {
        return await this.refreshAndPersistAccessToken(integration);
      } catch (err) {
        this.log.warn(
          `TikTok token refresh failed (integrationId=${integration.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    try {
      return this.encryption.decrypt(integration.accessTokenEncrypted);
    } catch {
      throw new BadRequestException(
        "Failed to decrypt TikTok access token. Reconnect the TikTok integration.",
      );
    }
  }

  private async refreshAndPersistAccessToken(
    integration: TikTokIntegration,
  ): Promise<string> {
    const clientKey =
      this.config.get<string>("TIKTOK_CLIENT_KEY")?.trim() ??
      this.config.get<string>("TIKTOK_APP_ID")?.trim();
    const clientSecret =
      this.config.get<string>("TIKTOK_CLIENT_SECRET")?.trim() ??
      this.config.get<string>("TIKTOK_APP_SECRET")?.trim();
    if (!clientKey || !clientSecret) {
      throw new BadRequestException(
        "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are not configured",
      );
    }

    const refreshToken = this.encryption.decrypt(
      integration.refreshTokenEncrypted!,
    );
    const body = new URLSearchParams();
    body.set("client_key", clientKey);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: body.toString(),
    });
    const text = await response.text();
    let json: TikTokTokenRefreshResponse = {};
    if (text) {
      try {
        json = JSON.parse(text) as TikTokTokenRefreshResponse;
      } catch {
        throw new BadGatewayException("TikTok token refresh returned invalid JSON");
      }
    }
    if (!response.ok || json.error?.code || !json.access_token?.trim()) {
      throw new BadGatewayException(
        json.error?.message ??
          json.error_description ??
          `TikTok token refresh failed (HTTP ${response.status})`,
      );
    }

    const now = Date.now();
    integration.accessTokenEncrypted = this.encryption.encrypt(
      json.access_token.trim(),
    );
    if (json.refresh_token?.trim()) {
      integration.refreshTokenEncrypted = this.encryption.encrypt(
        json.refresh_token.trim(),
      );
    }
    if (typeof json.expires_in === "number" && json.expires_in > 0) {
      integration.accessTokenExpiresAt = new Date(
        now + json.expires_in * 1000,
      );
    }
    if (
      typeof json.refresh_expires_in === "number" &&
      json.refresh_expires_in > 0
    ) {
      integration.refreshTokenExpiresAt = new Date(
        now + json.refresh_expires_in * 1000,
      );
    }
    if (json.scope?.trim()) {
      integration.scopes = json.scope.trim();
    }
    await this.tiktokRepo.save(integration);
    return json.access_token.trim();
  }

  private async tikTokJson<T extends TikTokErrorBody>(
    url: string,
    init: RequestInit,
    scopeHint: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      throw new BadGatewayException(
        `Failed to reach TikTok API: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await response.text();
    let json: T = {} as T;
    if (text) {
      try {
        json = JSON.parse(text) as T;
      } catch {
        throw new BadGatewayException("TikTok API returned invalid JSON");
      }
    }

    const errorCode = json.error?.code;
    const errorMessage = json.error?.message ?? json.error_description;
    if (!response.ok || (errorCode && errorCode !== "ok")) {
      this.log.warn(
        `TikTok API HTTP ${response.status} scopeHint=${scopeHint} code=${errorCode ?? ""} body=${text.slice(0, 500)}`,
      );
      if (
        errorCode === "scope_not_authorized" ||
        /scope/i.test(errorMessage ?? "")
      ) {
        throw new BadRequestException(
          errorMessage ??
            `TikTok denied this call. Ensure OAuth scope "${scopeHint}" is enabled on the app and reconnect TikTok.`,
        );
      }
      throw new BadGatewayException(
        errorMessage ??
          `TikTok API request failed with status ${response.status}`,
      );
    }
    return json;
  }

  private mapVideo(raw: Record<string, unknown>): TikTokVideoDto {
    const id = this.asString(raw.id);
    const createTime = this.asNumber(raw.create_time);
    return {
      id: id ?? "",
      ...(this.asString(raw.title) ? { title: this.asString(raw.title) } : {}),
      ...(this.asString(raw.video_description)
        ? { videoDescription: this.asString(raw.video_description) }
        : {}),
      ...(createTime != null ? { createTime } : {}),
      ...(createTime != null
        ? { createTimeIso: new Date(createTime * 1000).toISOString() }
        : {}),
      ...(this.asString(raw.cover_image_url)
        ? { coverImageUrl: this.asString(raw.cover_image_url) }
        : {}),
      ...(this.asString(raw.share_url)
        ? { shareUrl: this.asString(raw.share_url) }
        : {}),
      ...(this.asNumber(raw.duration) != null
        ? { duration: this.asNumber(raw.duration)! }
        : {}),
      ...(this.asNumber(raw.like_count) != null
        ? { likeCount: this.asNumber(raw.like_count)! }
        : {}),
      ...(this.asNumber(raw.comment_count) != null
        ? { commentCount: this.asNumber(raw.comment_count)! }
        : {}),
      ...(this.asNumber(raw.share_count) != null
        ? { shareCount: this.asNumber(raw.share_count)! }
        : {}),
      ...(this.asNumber(raw.view_count) != null
        ? { viewCount: this.asNumber(raw.view_count)! }
        : {}),
    };
  }

  private mapComment(raw: Record<string, unknown>): TikTokCommentDto {
    const createTime = this.asNumber(raw.create_time);
    return {
      id: this.asString(raw.id) ?? "",
      ...(this.asString(raw.video_id)
        ? { videoId: this.asString(raw.video_id) }
        : {}),
      ...(this.asString(raw.text) ? { text: this.asString(raw.text) } : {}),
      ...(createTime != null ? { createTime } : {}),
      ...(createTime != null
        ? { createTimeIso: new Date(createTime * 1000).toISOString() }
        : {}),
      ...(this.asNumber(raw.like_count) != null
        ? { likeCount: this.asNumber(raw.like_count)! }
        : {}),
      ...(this.asNumber(raw.reply_count) != null
        ? { replyCount: this.asNumber(raw.reply_count)! }
        : {}),
      ...(this.asString(raw.parent_comment_id)
        ? { parentCommentId: this.asString(raw.parent_comment_id) }
        : {}),
      ...(this.asString(raw.display_name)
        ? { displayName: this.asString(raw.display_name) }
        : {}),
    };
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return undefined;
  }
}
