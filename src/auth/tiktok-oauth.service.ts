import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "node:crypto";
import { Repository } from "typeorm";
import {
  TIKTOK_INTEGRATION_PROVIDER,
  TikTokIntegration,
} from "../database/entities/tiktok-integration.entity";
import { TikTokOAuthPendingSession } from "../database/entities/tiktok-oauth-pending-session.entity";
import { Workspace } from "../database/entities";
import type { TikTokOAuthPendingPollResponseDto } from "../integrations/dto/http/tiktok-oauth-pending.dto";
import { CredentialsEncryptionService } from "../payments/encryption/credentials-encryption.service";

const DEFAULT_OAUTH_SCOPES = ["biz.brand.insights", "comment.list"];

const STATE_TTL_SECONDS = 15 * 60;
const PENDING_SESSION_TTL_MS = 30 * 60 * 1000;

/** Match TikTok Developer Portal authorize URL (no trailing slash). */
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

type OAuthStatePayload = {
  sub: "tiktok-oauth";
  userId: number;
  workspaceId: number;
  sessionId: string;
};

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

type TikTokUserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
      username?: string;
    };
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

@Injectable()
export class TikTokOAuthService {
  private readonly log = new Logger(TikTokOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly encryption: CredentialsEncryptionService,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(TikTokIntegration)
    private readonly tiktokIntegrationRepo: Repository<TikTokIntegration>,
    @InjectRepository(TikTokOAuthPendingSession)
    private readonly pendingSessionRepo: Repository<TikTokOAuthPendingSession>,
  ) {}

  private maskToken(t: string): string {
    if (t.length <= 8) return "***";
    return `${t.slice(0, 4)}…${t.slice(-4)} (len=${t.length})`;
  }

  /**
   * TikTok Login Kit URL for the owner's workspace.
   * Creates a correlation `sessionId` the client should poll until connected.
   */
  async startTikTokOAuthForOwner(
    ownerId: number,
    workspaceId?: number,
  ): Promise<{ url: string; sessionId: string; expiresAt: string }> {
    const clientKey = this.requireEnvEither(
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_APP_ID",
    );
    const redirectUri = this.requireEnv("TIKTOK_REDIRECT_URI");
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException("owner id must be a positive integer");
    }

    const workspace =
      workspaceId != null
        ? await this.requireWorkspaceForOwner(ownerId, workspaceId)
        : await this.requireWorkspaceForOwner(ownerId);

    await this.pendingSessionRepo.delete({
      workspaceId: workspace.id,
      userId: ownerId,
    });

    const { codeVerifier, codeChallenge } = this.generatePkcePair();

    const expiresAt = new Date(Date.now() + PENDING_SESSION_TTL_MS);
    const session = await this.pendingSessionRepo.save(
      this.pendingSessionRepo.create({
        workspaceId: workspace.id,
        userId: ownerId,
        status: "awaiting_tiktok",
        integrationId: null,
        codeVerifier,
        errorMessage: null,
        expiresAt,
      }),
    );

    const url = this.buildAuthorizeUrlForSession(
      ownerId,
      workspace.id,
      session.id,
      clientKey,
      redirectUri,
      codeChallenge,
    );

    return {
      url,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private buildAuthorizeUrlForSession(
    userId: number,
    workspaceId: number,
    sessionId: string,
    clientKey: string,
    redirectUri: string,
    codeChallenge: string,
  ): string {
    const state = this.jwtService.sign(
      {
        sub: "tiktok-oauth",
        userId,
        workspaceId,
        sessionId,
      } satisfies OAuthStatePayload,
      { expiresIn: STATE_TTL_SECONDS },
    );

    this.log.log(
      `TikTok OAuth start workspaceId=${workspaceId} userId=${userId} sessionId=${sessionId} state=${state.slice(0, 8)}…`,
    );

    const u = new URL(AUTHORIZE_URL);
    u.searchParams.set("client_key", clientKey);
    u.searchParams.set("scope", this.getOAuthScopeQueryValue());
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    // TikTok requires PKCE (hex SHA-256 code_challenge + S256).
    u.searchParams.set("code_challenge", codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");

    return u.toString();
  }

  /**
   * TikTok PKCE: code_challenge = hex(SHA256(code_verifier)), method S256.
   * @see https://developers.tiktok.com/doc/login-kit-desktop
   */
  private generatePkcePair(): {
    codeVerifier: string;
    codeChallenge: string;
  } {
    const charset =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = randomBytes(64);
    let codeVerifier = "";
    for (let i = 0; i < bytes.length; i++) {
      codeVerifier += charset[bytes[i]! % charset.length];
    }
    const codeChallenge = createHash("sha256")
      .update(codeVerifier, "utf8")
      .digest("hex");
    return { codeVerifier, codeChallenge };
  }

  private getOAuthScopeQueryValue(): string {
    const override = this.config.get<string>("TIKTOK_OAUTH_SCOPES")?.trim();
    if (override != null && override.length > 0) return override;
    return DEFAULT_OAUTH_SCOPES.join(",");
  }

  private requireEnvEither(a: string, b: string): string {
    const v =
      this.config.get<string>(a)?.trim() ?? this.config.get<string>(b)?.trim();
    if (!v) {
      throw new BadRequestException(
        `${a} (or ${b}) is not configured in the environment`,
      );
    }
    return v;
  }

  private requireEnv(name: string): string {
    const v = this.config.get<string>(name)?.trim();
    if (!v) {
      throw new BadRequestException(
        `${name} is not configured in the environment`,
      );
    }
    return v;
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
    oauthErrorDescription: string | undefined,
  ): Promise<{ ok: true; sessionId: string; status: "connected" | "failed" }> {
    let pending: OAuthStatePayload | null = null;
    if (state?.trim()) {
      try {
        const decoded = this.jwtService.verify<OAuthStatePayload>(state.trim());
        if (decoded.sub === "tiktok-oauth" && decoded.sessionId) {
          pending = decoded;
        }
      } catch {
        pending = null;
      }
    }

    if (oauthError) {
      const message =
        oauthErrorDescription ?? oauthError ?? "TikTok OAuth failed";
      this.log.warn(
        `TikTok OAuth error from provider error=${oauthError} description=${oauthErrorDescription ?? ""}`,
      );
      if (pending?.sessionId) {
        await this.markPendingFailed(pending.sessionId, pending.userId, message);
        return {
          ok: true,
          sessionId: pending.sessionId,
          status: "failed",
        };
      }
      throw new BadRequestException(message);
    }

    if (!code?.trim()) {
      throw new BadRequestException("Missing authorization code");
    }
    if (!pending) {
      this.log.warn("TikTok OAuth invalid or expired state");
      throw new BadRequestException(
        "Invalid or expired state; start again from POST /integrations",
      );
    }

    const clientKey = this.requireEnvEither(
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_APP_ID",
    );
    const clientSecret = this.requireEnvEither(
      "TIKTOK_CLIENT_SECRET",
      "TIKTOK_APP_SECRET",
    );
    const redirectUri = this.requireEnv("TIKTOK_REDIRECT_URI");

    this.log.log(
      `TikTok OAuth callback exchanging code (workspaceId=${pending.workspaceId} userId=${pending.userId} sessionId=${pending.sessionId})`,
    );

    try {
      const session = await this.requirePendingSessionForOwner(
        pending.userId,
        pending.sessionId,
        { allowAwaiting: true },
      );
      const codeVerifier = session.codeVerifier?.trim();
      if (!codeVerifier) {
        throw new BadRequestException(
          "TikTok OAuth session is missing PKCE code_verifier; start again from POST /integrations",
        );
      }

      const tokens = await this.exchangeCodeForTokens(
        clientKey,
        clientSecret,
        redirectUri,
        code.trim(),
        codeVerifier,
      );
      this.log.log(
        `TikTok tokens received openId=${tokens.openId} access=${this.maskToken(tokens.accessToken)}`,
      );

      const workspace = await this.requireWorkspaceForOwner(
        pending.userId,
        pending.workspaceId,
      );

      const profile = await this.fetchUserInfoBestEffort(tokens.accessToken);
      const integration = await this.saveConnectedTikTokIntegration({
        workspace,
        openId: tokens.openId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        refreshExpiresIn: tokens.refreshExpiresIn,
        scopes: tokens.scope,
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      });

      session.status = "connected";
      session.integrationId = integration.id;
      session.errorMessage = null;
      session.expiresAt = new Date(Date.now() + PENDING_SESSION_TTL_MS);
      await this.pendingSessionRepo.save(session);

      this.log.log(
        `TikTok OAuth connected session=${session.id} integrationId=${integration.id} openId=${tokens.openId}`,
      );

      return {
        ok: true,
        sessionId: session.id,
        status: "connected",
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TikTok OAuth failed";
      await this.markPendingFailed(
        pending.sessionId,
        pending.userId,
        message,
      );
      throw err;
    }
  }

  async pollPendingSessionForOwner(
    ownerId: number,
    sessionId: string,
  ): Promise<TikTokOAuthPendingPollResponseDto> {
    const session = await this.requirePendingSessionForOwner(
      ownerId,
      sessionId,
      { allowAwaiting: true, allowFailed: true, allowConnected: true },
    );
    return {
      sessionId: session.id,
      status: session.status,
      integrationId:
        session.status === "connected" ? session.integrationId : null,
      expiresAt: session.expiresAt.toISOString(),
      ...(session.status === "failed"
        ? { error: session.errorMessage }
        : { error: null }),
    };
  }

  /** Revoke TikTok access for a stored access token (best effort). */
  async revokeIntegrationPermissionsBestEffort(
    integration: TikTokIntegration,
  ): Promise<void> {
    const encrypted = integration.accessTokenEncrypted?.trim();
    if (!encrypted) {
      return;
    }
    try {
      const accessToken = this.encryption.decrypt(encrypted);
      await this.revokeAccessTokenBestEffort(accessToken);
    } catch {
      this.log.warn(
        `Could not decrypt TikTok access token for revoke (integrationId=${integration.id})`,
      );
    }
  }

  private async requireWorkspaceForOwner(
    ownerId: number,
    workspaceId?: number,
  ): Promise<Workspace> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException("owner id must be a positive integer");
    }

    if (workspaceId != null) {
      if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
        throw new BadRequestException(
          "workspace id must be a positive integer",
        );
      }
      const workspace = await this.workspaceRepo.findOne({
        where: { id: workspaceId, ownerId },
      });
      if (!workspace) {
        throw new NotFoundException("Workspace not found for current user");
      }
      return workspace;
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!workspace) {
      throw new NotFoundException(
        "Workspace not found for this user; create a workspace first",
      );
    }
    return workspace;
  }

  private async saveConnectedTikTokIntegration(params: {
    workspace: Workspace;
    openId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number | null;
    refreshExpiresIn: number | null;
    scopes: string | null;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  }): Promise<TikTokIntegration> {
    const now = new Date();
    const existing = await this.tiktokIntegrationRepo.findOne({
      where: {
        workspaceId: params.workspace.id,
        openId: params.openId,
      },
      order: { id: "DESC" },
    });

    const displayName = params.displayName?.trim() || null;
    const username = params.username?.trim() || null;
    const name =
      displayName ||
      (username ? `@${username}` : null) ||
      `TikTok ${params.openId.slice(0, 8)}`;

    const accessTokenExpiresAt =
      params.expiresIn != null && params.expiresIn > 0
        ? new Date(now.getTime() + params.expiresIn * 1000)
        : null;
    const refreshTokenExpiresAt =
      params.refreshExpiresIn != null && params.refreshExpiresIn > 0
        ? new Date(now.getTime() + params.refreshExpiresIn * 1000)
        : null;

    const accessTokenEncrypted = this.encryption.encrypt(params.accessToken);
    const refreshTokenEncrypted = params.refreshToken
      ? this.encryption.encrypt(params.refreshToken)
      : null;
    const scopes = params.scopes?.trim() || null;

    if (existing) {
      existing.name = name;
      existing.provider = TIKTOK_INTEGRATION_PROVIDER;
      existing.accessTokenEncrypted = accessTokenEncrypted;
      existing.refreshTokenEncrypted = refreshTokenEncrypted;
      existing.scopes = scopes ?? existing.scopes;
      existing.accessTokenExpiresAt = accessTokenExpiresAt;
      existing.refreshTokenExpiresAt = refreshTokenExpiresAt;
      existing.status = "CONNECTED";
      existing.displayName = displayName;
      existing.username = username;
      existing.avatarUrl = params.avatarUrl?.trim() || null;
      existing.ownerId = params.workspace.ownerId;
      return this.tiktokIntegrationRepo.save(existing);
    }

    return this.tiktokIntegrationRepo.save(
      this.tiktokIntegrationRepo.create({
        provider: TIKTOK_INTEGRATION_PROVIDER,
        name,
        openId: params.openId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        scopes,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        status: "CONNECTED",
        displayName,
        username,
        avatarUrl: params.avatarUrl?.trim() || null,
        ownerId: params.workspace.ownerId,
        workspaceId: params.workspace.id,
      }),
    );
  }

  private async exchangeCodeForTokens(
    clientKey: string,
    clientSecret: string,
    redirectUri: string,
    code: string,
    codeVerifier: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string | null;
    openId: string;
    expiresIn: number | null;
    refreshExpiresIn: number | null;
    scope: string | null;
  }> {
    const body = new URLSearchParams();
    body.set("client_key", clientKey);
    body.set("client_secret", clientSecret);
    body.set("code", code);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", redirectUri);
    body.set("code_verifier", codeVerifier);

    const json = await this.postFormUrlEncoded<TikTokTokenResponse>(
      TOKEN_URL,
      body,
    );

    if (json.error) {
      this.log.warn(
        `TikTok token exchange error=${json.error} description=${json.error_description ?? ""} log_id=${json.log_id ?? ""}`,
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

  private async fetchUserInfoBestEffort(
    accessToken: string,
  ): Promise<{
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null> {
    const fields = "open_id,union_id,avatar_url,display_name,username";
    const u = new URL(USER_INFO_URL);
    u.searchParams.set("fields", fields);

    try {
      const response = await fetch(u.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const text = await response.text();
      let body: TikTokUserInfoResponse = {};
      if (text) {
        try {
          body = JSON.parse(text) as TikTokUserInfoResponse;
        } catch {
          this.log.warn("TikTok user.info returned invalid JSON");
          return null;
        }
      }
      if (!response.ok) {
        this.log.warn(
          `TikTok user.info HTTP ${response.status}: ${text.slice(0, 300)}`,
        );
        return null;
      }
      if (body.error?.code && body.error.code !== "ok") {
        this.log.warn(
          `TikTok user.info error=${body.error.code} message=${body.error.message ?? ""}`,
        );
        return null;
      }
      const user = body.data?.user;
      return {
        displayName: user?.display_name?.trim() || null,
        username: user?.username?.trim() || null,
        avatarUrl: user?.avatar_url?.trim() || null,
      };
    } catch (err) {
      this.log.warn(
        `TikTok user.info failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async requirePendingSessionForOwner(
    ownerId: number,
    sessionId: string,
    options?: {
      allowAwaiting?: boolean;
      allowFailed?: boolean;
      allowConnected?: boolean;
    },
  ): Promise<TikTokOAuthPendingSession> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException("owner id must be a positive integer");
    }
    const id = sessionId?.trim();
    if (!id) {
      throw new BadRequestException("sessionId is required");
    }

    const session = await this.pendingSessionRepo.findOne({ where: { id } });
    if (!session || session.userId !== ownerId) {
      throw new NotFoundException("TikTok OAuth session not found");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.pendingSessionRepo.delete({ id: session.id });
      throw new BadRequestException(
        "TikTok OAuth session expired; start again from POST /integrations",
      );
    }
    if (
      session.status === "awaiting_tiktok" &&
      options?.allowAwaiting !== true
    ) {
      throw new BadRequestException(
        "TikTok Login is not finished yet. Keep polling until status is connected.",
      );
    }
    if (session.status === "failed" && options?.allowFailed !== true) {
      throw new BadRequestException(
        session.errorMessage ??
          "TikTok Login failed; start again from POST /integrations",
      );
    }
    if (
      session.status === "connected" &&
      options?.allowConnected !== true
    ) {
      throw new BadRequestException(
        "TikTok Login already completed for this session",
      );
    }
    return session;
  }

  private async markPendingFailed(
    sessionId: string,
    userId: number,
    message: string,
  ): Promise<void> {
    const session = await this.pendingSessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      return;
    }
    session.status = "failed";
    session.errorMessage = message.slice(0, 2000);
    await this.pendingSessionRepo.save(session);
  }

  private async revokeAccessTokenBestEffort(
    accessToken: string,
  ): Promise<void> {
    let clientKey: string;
    let clientSecret: string;
    try {
      clientKey = this.requireEnvEither("TIKTOK_CLIENT_KEY", "TIKTOK_APP_ID");
      clientSecret = this.requireEnvEither(
        "TIKTOK_CLIENT_SECRET",
        "TIKTOK_APP_SECRET",
      );
    } catch {
      this.log.warn("TikTok revoke skipped: client credentials not configured");
      return;
    }

    const body = new URLSearchParams();
    body.set("client_key", clientKey);
    body.set("client_secret", clientSecret);
    body.set("token", accessToken);

    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body: body.toString(),
      });
      const text = await response.text();
      if (!response.ok) {
        let message = text.slice(0, 300);
        try {
          const parsed = JSON.parse(text) as TikTokTokenResponse;
          message = parsed.error_description ?? parsed.error ?? message;
        } catch {
          /* keep raw snippet */
        }
        this.log.warn(`TikTok revoke HTTP ${response.status}: ${message}`);
        return;
      }
      this.log.log("TikTok token revoke succeeded");
    } catch (err) {
      this.log.warn(
        `TikTok revoke failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async postFormUrlEncoded<T>(
    url: string,
    body: URLSearchParams,
  ): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: body.toString(),
    });
    const text = await response.text();
    let parsed: T = {} as T;
    if (text) {
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        throw new BadGatewayException("TikTok API returned invalid JSON");
      }
    }
    if (!response.ok) {
      const errBody = parsed as TikTokTokenResponse;
      this.log.warn(
        `TikTok API HTTP ${response.status} body=${text.slice(0, 500)}`,
      );
      throw new BadGatewayException(
        errBody.error_description ??
          errBody.error ??
          `TikTok API request failed with status ${response.status}`,
      );
    }
    return parsed;
  }
}
