import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "node:crypto";
import { IsNull, Repository } from "typeorm";
import {
  TIKTOK_INTEGRATION_PROVIDER,
  TikTokIntegration,
} from "../database/entities/tiktok-integration.entity";
import { TikTokOAuthState } from "../database/entities/tiktok-oauth-state.entity";
import { CredentialsEncryptionService } from "../payments/encryption/credentials-encryption.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const DEFAULT_OAUTH_SCOPE =
  "user.info.basic,user.info.profile,video.list,comment.list,biz.brand.insights";
const STATE_TTL_MS = 10 * 60 * 1000;

type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
};

@Injectable()
export class TikTokOAuthConnectService {
  private readonly log = new Logger(TikTokOAuthConnectService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: CredentialsEncryptionService,
    private readonly workspaceContext: WorkspaceAccessContextService,
    @InjectRepository(TikTokIntegration)
    private readonly integrationRepo: Repository<TikTokIntegration>,
    @InjectRepository(TikTokOAuthState)
    private readonly stateRepo: Repository<TikTokOAuthState>,
  ) {}

  async startConnect(
    userId: number,
    workspaceId: number,
    appRole?: string,
  ): Promise<{ authorizationUrl: string }> {
    const workspace = await this.workspaceContext.requireWorkspaceOwner(
      userId,
      workspaceId,
      appRole,
    );

    const clientKey = this.requireEnv("TIKTOK_CLIENT_KEY");
    const redirectUri = this.requireEnv("TIKTOK_REDIRECT_URI");

    const state = this.generateState();
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    await this.stateRepo.save(
      this.stateRepo.create({
        state,
        workspaceId: workspace.id,
        userId,
        expiresAt,
        usedAt: null,
      }),
    );

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      this.config.get<string>("TIKTOK_OAUTH_SCOPES")?.trim() ||
        DEFAULT_OAUTH_SCOPE,
    );
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    this.log.log(
      `TikTok OAuth connect started workspaceId=${workspace.id} userId=${userId}`,
    );

    return { authorizationUrl: url.toString() };
  }

  /** Completes OAuth. Returns frontend redirect status only — never tokens. */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
  ): Promise<"success" | "error"> {
    if (oauthError?.trim()) {
      this.log.warn(`TikTok OAuth denied error=${oauthError.trim()}`);
      return "error";
    }
    if (!code?.trim() || !state?.trim()) {
      this.log.warn("TikTok OAuth callback missing code or state");
      return "error";
    }

    try {
      const oauthState = await this.consumeState(state.trim());
      const tokens = await this.exchangeCodeForTokens(code.trim());
      await this.upsertIntegration({
        workspaceId: oauthState.workspaceId,
        ownerId: oauthState.userId,
        openId: tokens.openId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        scopes: tokens.scope,
        expiresIn: tokens.expiresIn,
        refreshExpiresIn: tokens.refreshExpiresIn,
      });
      this.log.log(
        `TikTok OAuth connected workspaceId=${oauthState.workspaceId} openId=${tokens.openId}`,
      );
      return "success";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TikTok OAuth failed";
      this.log.warn(`TikTok OAuth callback failed: ${message}`);
      return "error";
    }
  }

  frontendRedirectUrl(status: "success" | "error"): string {
    const base = (this.config.get<string>("APP_URL") ?? "")
      .trim()
      .replace(/\/$/, "");
    if (!base) {
      throw new BadRequestException("APP_URL is not configured");
    }
    return `${base}/settings/integrations/tiktok?status=${status}`;
  }

  private async consumeState(state: string): Promise<TikTokOAuthState> {
    const row = await this.stateRepo.findOne({
      where: { state, usedAt: IsNull() },
    });
    if (!row) {
      throw new BadRequestException("Invalid or already used OAuth state");
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("OAuth state expired");
    }
    row.usedAt = new Date();
    await this.stateRepo.save(row);
    return row;
  }

  private async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string | null;
    openId: string;
    expiresIn: number | null;
    refreshExpiresIn: number | null;
    scope: string | null;
  }> {
    const clientKey = this.requireEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = this.requireEnv("TIKTOK_CLIENT_SECRET");
    const redirectUri = this.requireEnv("TIKTOK_REDIRECT_URI");

    const body = new URLSearchParams();
    body.set("client_key", clientKey);
    body.set("client_secret", clientSecret);
    body.set("code", code);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", redirectUri);

    let json: TikTokTokenResponse;
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });
      json = (await res.json()) as TikTokTokenResponse;
      if (!res.ok && !json.error) {
        throw new BadGatewayException(
          `TikTok token endpoint HTTP ${res.status}`,
        );
      }
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException("Failed to reach TikTok token endpoint");
    }

    if (json.error) {
      this.log.warn(
        `TikTok token exchange error=${json.error} log_id=${json.log_id ?? ""}`,
      );
      throw new BadGatewayException(
        json.error_description ??
          json.error ??
          "Failed to exchange code for TikTok access token",
      );
    }

    const accessToken = json.access_token?.trim();
    const openId = json.open_id?.trim();
    if (!accessToken || !openId) {
      throw new BadGatewayException(
        "TikTok token response missing access_token or open_id",
      );
    }

    return {
      accessToken,
      refreshToken: json.refresh_token?.trim() || null,
      openId,
      expiresIn:
        typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
          ? json.expires_in
          : null,
      refreshExpiresIn:
        typeof json.refresh_expires_in === "number" &&
        Number.isFinite(json.refresh_expires_in)
          ? json.refresh_expires_in
          : null,
      scope: json.scope?.trim() || null,
    };
  }

  private async upsertIntegration(params: {
    workspaceId: number;
    ownerId: number;
    openId: string;
    accessToken: string;
    refreshToken: string | null;
    scopes: string | null;
    expiresIn: number | null;
    refreshExpiresIn: number | null;
  }): Promise<TikTokIntegration> {
    const now = new Date();
    const accessTokenEncrypted = this.encryption.encrypt(params.accessToken);
    const refreshTokenEncrypted = params.refreshToken
      ? this.encryption.encrypt(params.refreshToken)
      : null;
    const accessTokenExpiresAt =
      params.expiresIn != null && params.expiresIn > 0
        ? new Date(now.getTime() + params.expiresIn * 1000)
        : null;
    const refreshTokenExpiresAt =
      params.refreshExpiresIn != null && params.refreshExpiresIn > 0
        ? new Date(now.getTime() + params.refreshExpiresIn * 1000)
        : null;
    const name = `TikTok ${params.openId.slice(0, 8)}`;

    const existing = await this.integrationRepo.findOne({
      where: {
        workspaceId: params.workspaceId,
        openId: params.openId,
      },
    });

    if (existing) {
      existing.provider = TIKTOK_INTEGRATION_PROVIDER;
      existing.name = existing.name?.trim() || name;
      existing.accessTokenEncrypted = accessTokenEncrypted;
      existing.refreshTokenEncrypted = refreshTokenEncrypted;
      existing.scopes = params.scopes ?? existing.scopes;
      existing.accessTokenExpiresAt = accessTokenExpiresAt;
      existing.refreshTokenExpiresAt = refreshTokenExpiresAt;
      existing.status = "CONNECTED";
      existing.ownerId = params.ownerId;
      return this.integrationRepo.save(existing);
    }

    return this.integrationRepo.save(
      this.integrationRepo.create({
        provider: TIKTOK_INTEGRATION_PROVIDER,
        name,
        openId: params.openId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        scopes: params.scopes,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        status: "CONNECTED",
        ownerId: params.ownerId,
        workspaceId: params.workspaceId,
        displayName: null,
        username: null,
        avatarUrl: null,
      }),
    );
  }

  private generateState(): string {
    return createHash("sha256").update(randomBytes(32)).digest("hex");
  }

  private requireEnv(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new BadRequestException(`${name} is not configured`);
    }
    return value;
  }
}
