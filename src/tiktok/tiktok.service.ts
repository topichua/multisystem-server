import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
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
  TikTokCommentsDiagnoseAttemptDto,
  TikTokCommentsDiagnoseResponseDto,
} from "./dto/tiktok-comments-diagnose.dto";
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

type TikTokFetchResult<T> = {
  ok: boolean;
  httpStatus: number;
  json: T;
  text: string;
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
    this.assertGrantedScope(integration, "video.list");
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
    const diagnostic = await this.diagnoseCommentsForOwner(
      ownerId,
      videoIdRaw,
      query,
    );
    if (diagnostic.reason !== "ok") {
      this.log.warn(
        `TikTok comments failed videoId=${diagnostic.videoId} reason=${diagnostic.reason} diagnostic=${JSON.stringify(diagnostic)}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: "Bad Request",
          message: diagnostic.message,
          reason: diagnostic.reason,
          fix: diagnostic.fix,
          videoId: diagnostic.videoId,
          integration: diagnostic.integration,
          oauthScopesConfigured: diagnostic.oauthScopesConfigured,
          attempts: diagnostic.attempts,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const success = diagnostic.attempts.find((a) => a.ok);
    const json = (success?.responseJson ?? {}) as TikTokCommentListResponse;
    return {
      data: (json.data?.comments ?? []).map((raw) => this.mapComment(raw)),
      ...(json.data?.cursor != null ? { cursor: Number(json.data.cursor) } : {}),
      ...(typeof json.data?.has_more === "boolean"
        ? { hasMore: json.data.has_more }
        : {}),
      videoId: diagnostic.videoId,
      integrationId: diagnostic.integration.id,
    };
  }

  /**
   * Probes TikTok comment.list (GET then POST) and returns a structured
   * explanation of success or failure — does not throw on TikTok API errors.
   */
  async diagnoseCommentsForOwner(
    ownerId: number,
    videoIdRaw: string,
    query: ListTikTokCommentsQueryDto = {},
  ): Promise<TikTokCommentsDiagnoseResponseDto> {
    const videoId = videoIdRaw?.trim();
    if (!videoId || videoId.length > 64) {
      throw new BadRequestException("videoId is required");
    }

    const integration = await this.requireConnectedIntegrationForOwner(
      ownerId,
      query.integrationId,
    );
    const oauthScopesConfigured = this.getConfiguredOAuthScopes();
    const grantedScopes = this.parseScopes(integration.scopes);
    const hasCommentListScope =
      grantedScopes.size === 0 ? undefined : grantedScopes.has("comment.list");

    const expiresAt = integration.accessTokenExpiresAt?.getTime() ?? 0;
    const accessTokenNearExpiry =
      !expiresAt || expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS;

    const integrationDiag = {
      id: integration.id,
      openId: integration.openId,
      scopes: integration.scopes,
      hasCommentListScope,
      accessTokenExpiresAt: integration.accessTokenExpiresAt
        ? integration.accessTokenExpiresAt.toISOString()
        : null,
      accessTokenNearExpiry,
      status: integration.status,
    };

    if (hasCommentListScope === false) {
      return {
        reason: "scope_missing_on_token",
        message: `Stored token for integration #${integration.id} does not include comment.list (granted: ${integration.scopes}).`,
        fix: 'Enable comment.list in TikTok Developer Portal, then DELETE this integration and reconnect via POST /integrations { "integration_type": "tiktok" }.',
        videoId,
        integration: integrationDiag,
        oauthScopesConfigured,
        attempts: [],
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.resolveAccessToken(integration);
    } catch (err) {
      return {
        reason: "access_token_invalid",
        message:
          err instanceof Error
            ? err.message
            : "Failed to resolve TikTok access token",
        fix: 'Reconnect TikTok via POST /integrations { "integration_type": "tiktok" }.',
        videoId,
        integration: integrationDiag,
        oauthScopesConfigured,
        attempts: [],
      };
    }

    const attempts: TikTokCommentsDiagnoseAttemptDto[] = [];

    const getUrl = new URL(COMMENT_LIST_URL);
    getUrl.searchParams.set("fields", COMMENT_FIELDS);
    getUrl.searchParams.set("video_id", videoId);
    getUrl.searchParams.set("max_count", String(query.maxCount ?? 20));
    if (query.cursor != null) {
      getUrl.searchParams.set("cursor", String(query.cursor));
    }

    attempts.push(
      await this.probeTikTokJson<TikTokCommentListResponse>(getUrl.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );

    if (!attempts[0]?.ok) {
      const postUrl = new URL(COMMENT_LIST_URL);
      postUrl.searchParams.set("fields", COMMENT_FIELDS);
      const postBody: Record<string, unknown> = {
        video_id: this.parseVideoIdForBody(videoId),
        max_count: query.maxCount ?? 20,
      };
      if (query.cursor != null) {
        postBody.cursor = query.cursor;
      }
      attempts.push(
        await this.probeTikTokJson<TikTokCommentListResponse>(
          postUrl.toString(),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(postBody),
          },
        ),
      );
    }

    const success = attempts.find((a) => a.ok);
    if (success) {
      const json = success.responseJson as TikTokCommentListResponse;
      return {
        reason: "ok",
        message: "TikTok comment.list succeeded",
        videoId,
        integration: integrationDiag,
        oauthScopesConfigured,
        attempts,
        commentsSample: (json.data?.comments ?? []).slice(0, 3),
      };
    }

    const last = attempts[attempts.length - 1]!;
    const classified = this.classifyTikTokCommentFailure(last);
    return {
      reason: classified.reason,
      message: classified.message,
      fix: classified.fix,
      videoId,
      integration: integrationDiag,
      oauthScopesConfigured,
      attempts,
    };
  }

  private classifyTikTokCommentFailure(
    attempt: TikTokCommentsDiagnoseAttemptDto,
  ): {
    reason: string;
    message: string;
    fix: string;
  } {
    const code = attempt.errorCode ?? "";
    const msg = attempt.errorMessage ?? "";
    if (
      code === "scope_not_authorized" ||
      /scope/i.test(msg) ||
      code === "scope_permission_missed"
    ) {
      return {
        reason: "scope_not_authorized",
        message:
          msg ||
          "TikTok rejected comment.list — scope not authorized on this token.",
        fix: "In TikTok Developer Portal enable the product that provides comment.list, ensure that scope is Added (not pending), then DELETE the integration and reconnect so the token includes comment.list.",
      };
    }
    if (code === "access_token_invalid") {
      return {
        reason: "access_token_invalid",
        message: msg || "TikTok access token is invalid.",
        fix: 'Reconnect TikTok via POST /integrations { "integration_type": "tiktok" }.',
      };
    }
    if (code === "invalid_params" || /invalid/i.test(msg)) {
      return {
        reason: "invalid_params",
        message:
          msg ||
          "TikTok rejected the comment.list request parameters (often a bad video_id).",
        fix: "Confirm videoId is a TikTok video owned by the connected open_id (from GET /api/tiktok/videos when video.list is available). Pass TikTok log_id to TikTok support if needed.",
      };
    }
    if (attempt.httpStatus == null) {
      return {
        reason: "network_error",
        message: msg || "Failed to reach TikTok API",
        fix: "Retry later; check outbound network from the API host to open.tiktokapis.com.",
      };
    }
    return {
      reason: code || "tiktok_api_error",
      message:
        msg ||
        `TikTok comment.list failed (HTTP ${attempt.httpStatus ?? "?"})`,
      fix: "Inspect attempts[].responseJson / log_id. Common causes: wrong endpoint for your app product, video not owned by this user, or app not approved for comment APIs.",
    };
  }

  private async probeTikTokJson<T extends TikTokErrorBody>(
    url: string,
    init: RequestInit,
  ): Promise<TikTokCommentsDiagnoseAttemptDto> {
    const method = init.method ?? "GET";
    try {
      const result = await this.fetchTikTokJson<T>(url, init);
      const errorCode = result.json.error?.code;
      const errorMessage =
        result.json.error?.message ?? result.json.error_description;
      const logId = result.json.error?.log_id ?? result.json.log_id;
      const ok = result.ok && (!errorCode || errorCode === "ok");
      const attempt: TikTokCommentsDiagnoseAttemptDto = {
        method,
        url,
        httpStatus: result.httpStatus,
        responseJson: result.json,
        ok,
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(logId ? { logId } : {}),
      };
      if (!ok) {
        this.log.warn(
          `TikTok API failure method=${method} url=${url} status=${result.httpStatus} responseJson=${JSON.stringify(result.json)}`,
        );
      }
      return attempt;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(
        `TikTok API network failure method=${method} url=${url} error=${message}`,
      );
      return {
        method,
        url,
        ok: false,
        errorMessage: message,
        responseJson: { error: { code: "network_error", message } },
      };
    }
  }

  private parseVideoIdForBody(videoId: string): string | number {
    if (/^\d+$/.test(videoId) && videoId.length <= 16) {
      return Number(videoId);
    }
    // Large int64 ids stay as strings to avoid JS precision loss.
    return videoId;
  }

  private parseScopes(raw: string | null | undefined): Set<string> {
    if (!raw?.trim()) return new Set();
    return new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  private getConfiguredOAuthScopes(): string {
    return (
      this.config.get<string>("TIKTOK_OAUTH_SCOPES")?.trim() ||
      "user.info.basic,user.info.profile,video.list,comment.list,biz.brand.insights"
    );
  }

  private assertGrantedScope(
    integration: TikTokIntegration,
    required: string,
  ): void {
    const granted = this.parseScopes(integration.scopes);
    if (granted.size === 0) {
      // Older rows may lack scopes; let TikTok API decide.
      return;
    }
    if (!granted.has(required)) {
      throw new BadRequestException(
        `TikTok integration #${integration.id} was authorized without "${required}" (granted: ${integration.scopes}). Enable that scope in the TikTok Developer Portal, then DELETE this integration and reconnect via POST /integrations { "integration_type": "tiktok" }.`,
      );
    }
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
        throw new BadGatewayException(
          "TikTok token refresh returned invalid JSON",
        );
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

  private async fetchTikTokJson<T extends TikTokErrorBody>(
    url: string,
    init: RequestInit,
  ): Promise<TikTokFetchResult<T>> {
    const response = await fetch(url, init);
    const text = await response.text();
    let json: T = {} as T;
    if (text) {
      try {
        json = JSON.parse(text) as T;
      } catch {
        throw new BadGatewayException("TikTok API returned invalid JSON");
      }
    }
    return {
      ok: response.ok,
      httpStatus: response.status,
      json,
      text,
    };
  }

  private async tikTokJson<T extends TikTokErrorBody>(
    url: string,
    init: RequestInit,
    scopeHint: string,
  ): Promise<T> {
    let result: TikTokFetchResult<T>;
    try {
      result = await this.fetchTikTokJson<T>(url, init);
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(
        `Failed to reach TikTok API: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const errorCode = result.json.error?.code;
    const errorMessage =
      result.json.error?.message ?? result.json.error_description;
    if (!result.ok || (errorCode && errorCode !== "ok")) {
      this.log.warn(
        `TikTok API failure method=${init.method ?? "GET"} url=${url} status=${result.httpStatus} scopeHint=${scopeHint} responseJson=${JSON.stringify(result.json)}`,
      );
      if (
        errorCode === "scope_not_authorized" ||
        /scope/i.test(errorMessage ?? "")
      ) {
        throw new BadRequestException(
          `TikTok scope "${scopeHint}" is not on this token. In TikTok Developer Portal enable that scope, then DELETE the TikTok integration and reconnect (POST /integrations { "integration_type": "tiktok" }). Detail: ${errorMessage ?? errorCode}`,
        );
      }
      throw new BadGatewayException(
        errorMessage ??
          `TikTok API request failed with status ${result.httpStatus}`,
      );
    }
    return result.json;
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
    if (
      typeof value === "string" &&
      value.trim() &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
    return undefined;
  }
}
