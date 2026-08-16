import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Workspace } from "../database/entities";
import { InstagramOAuthPendingSession } from "../database/entities/instagram-oauth-pending-session.entity";
import type { JwtPayload } from "./interfaces/jwt-payload.interface";
import {
  INSTAGRAM_GRAPH_VERSION,
  INSTAGRAM_OAUTH_PROVIDER,
} from "../instagram/instagram-graph.util";

const STATE_TTL_SECONDS = 15 * 60;
const PENDING_SESSION_TTL_MS = 30 * 60 * 1000;

const DEFAULT_INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

type OAuthStatePayload = {
  sub: "instagram-oauth";
  userId: number;
  workspaceId: number;
  sessionId: string;
};

type MetaErrorBody = {
  error?: { message?: string; type?: string; code?: number };
  error_message?: string;
};

type ShortLivedTokenResponse = {
  access_token?: string;
  user_id?: string | number;
  permissions?: string[];
};

type LongLivedTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type InstagramMeResponse = {
  user_id?: string;
  id?: string;
  username?: string;
  name?: string;
  account_type?: string;
};

@Injectable()
export class InstagramOAuthService {
  private readonly log = new Logger(InstagramOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(InstagramOAuthPendingSession)
    private readonly pendingSessionRepo: Repository<InstagramOAuthPendingSession>,
  ) {}

  async startInstagramLoginForOwner(
    ownerId: number,
    workspaceId?: number,
  ): Promise<{ url: string; sessionId: string; expiresAt: string }> {
    const appId = this.requireInstagramAppId();
    const redirectUri = this.requireInstagramRedirectUri();
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

    const expiresAt = new Date(Date.now() + PENDING_SESSION_TTL_MS);
    const session = await this.pendingSessionRepo.save(
      this.pendingSessionRepo.create({
        workspaceId: workspace.id,
        userId: ownerId,
        status: "awaiting_instagram",
        oauthProvider: INSTAGRAM_OAUTH_PROVIDER.instagram,
        userAccessToken: null,
        pages: [],
        errorMessage: null,
        expiresAt,
      }),
    );

    const url = this.buildAuthorizeUrl(
      ownerId,
      workspace.id,
      session.id,
      appId,
      redirectUri,
    );

    return {
      url,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async buildAuthorizeRedirectUrl(
    jwtFromQuery: string | undefined,
    authHeader: string | undefined,
  ): Promise<string> {
    const rawToken = this.extractBearerToken(jwtFromQuery, authHeader);
    if (!rawToken) {
      throw new UnauthorizedException(
        "Missing JWT. Open GET /auth/instagram?jwt=YOUR_ACCESS_TOKEN or send Authorization: Bearer …",
      );
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired JWT");
    }

    if (payload.sub === "super-admin") {
      throw new ForbiddenException(
        "Instagram Login requires a workspace owner, not the env super-admin login.",
      );
    }

    const userId = Number.parseInt(payload.sub, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException("JWT subject must be a numeric user id");
    }

    const started = await this.startInstagramLoginForOwner(userId);
    return started.url;
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
    oauthErrorDescription: string | undefined,
  ): Promise<{ ok: true; sessionId: string; status: "select_page" | "failed" }> {
    let pending: OAuthStatePayload | null = null;
    if (state?.trim()) {
      try {
        const decoded = this.jwtService.verify<OAuthStatePayload>(state.trim());
        if (decoded.sub === "instagram-oauth" && decoded.sessionId) {
          pending = decoded;
        }
      } catch {
        pending = null;
      }
    }

    if (oauthError) {
      const message =
        oauthErrorDescription ?? oauthError ?? "Instagram Login failed";
      this.log.warn(
        `Instagram Login error from provider error=${oauthError} description=${oauthErrorDescription ?? ""}`,
      );
      if (pending?.sessionId) {
        await this.markPendingFailed(pending.sessionId, pending.userId, message);
        return { ok: true, sessionId: pending.sessionId, status: "failed" };
      }
      throw new BadRequestException(message);
    }

    if (!code?.trim() || !pending) {
      const message = "Instagram Login callback is missing code or state";
      if (pending?.sessionId) {
        await this.markPendingFailed(pending.sessionId, pending.userId, message);
        return { ok: true, sessionId: pending.sessionId, status: "failed" };
      }
      throw new BadRequestException(message);
    }

    try {
      const appId = this.requireInstagramAppId();
      const appSecret = this.requireInstagramAppSecret();
      const redirectUri = this.requireInstagramRedirectUri();

      const shortLived = await this.exchangeCodeForShortLivedToken(
        appId,
        appSecret,
        redirectUri,
        code.trim(),
      );
      const longLived = await this.exchangeForLongLivedToken(
        appSecret,
        shortLived.accessToken,
      );
      const profile = await this.fetchInstagramMe(longLived);
      const igUserId =
        profile.user_id?.trim() ||
        profile.id?.trim() ||
        shortLived.userId ||
        "";
      if (!igUserId) {
        throw new BadGatewayException(
          "Instagram Login did not return an Instagram user id",
        );
      }

      const username = profile.username?.trim() || "";
      const displayName =
        profile.name?.trim() ||
        (username ? `@${username}` : `Instagram ${igUserId}`);

      const session = await this.pendingSessionRepo.findOne({
        where: { id: pending.sessionId, userId: pending.userId },
      });
      if (!session) {
        throw new NotFoundException("Instagram OAuth session not found");
      }

      session.status = "select_page";
      session.oauthProvider = INSTAGRAM_OAUTH_PROVIDER.instagram;
      session.userAccessToken = longLived;
      session.errorMessage = null;
      session.pages = [
        {
          pageId: igUserId,
          pageName: displayName,
          pageAccessToken: longLived,
          instagramAccountId: igUserId,
        },
      ];
      await this.pendingSessionRepo.save(session);

      this.log.log(
        `Instagram Login complete sessionId=${session.id} igUserId=${igUserId} username=${username || "-"}`,
      );
      return { ok: true, sessionId: session.id, status: "select_page" };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Instagram Login failed";
      await this.markPendingFailed(pending.sessionId, pending.userId, message);
      this.log.warn(`Instagram Login callback failed: ${message}`);
      return { ok: true, sessionId: pending.sessionId, status: "failed" };
    }
  }

  private buildAuthorizeUrl(
    userId: number,
    workspaceId: number,
    sessionId: string,
    appId: string,
    redirectUri: string,
  ): string {
    const state = this.jwtService.sign(
      {
        sub: "instagram-oauth",
        userId,
        workspaceId,
        sessionId,
      } satisfies OAuthStatePayload,
      { expiresIn: STATE_TTL_SECONDS },
    );

    const u = new URL("https://www.instagram.com/oauth/authorize");
    u.searchParams.set("client_id", appId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.getOAuthScopeQueryValue());
    u.searchParams.set("state", state);
    u.searchParams.set("enable_fb_login", "0");
    return u.toString();
  }

  private getOAuthScopeQueryValue(): string {
    const override =
      this.config.get<string>("INSTAGRAM_OAUTH_SCOPES")?.trim() ??
      this.config.get<string>("IG_OAUTH_SCOPES")?.trim();
    if (override != null && override.length > 0) return override;
    return DEFAULT_INSTAGRAM_LOGIN_SCOPES.join(",");
  }

  private async exchangeCodeForShortLivedToken(
    appId: string,
    appSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<{ accessToken: string; userId: string }> {
    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const response = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await this.readJson(
      response,
    )) as ShortLivedTokenResponse & MetaErrorBody;
    const accessToken = json.access_token?.trim();
    const userId = json.user_id != null ? String(json.user_id) : "";
    if (!accessToken) {
      throw new BadGatewayException(
        json.error?.message ||
          json.error_message ||
          "Instagram did not return an access token",
      );
    }
    return { accessToken, userId };
  }

  private async exchangeForLongLivedToken(
    appSecret: string,
    shortLivedToken: string,
  ): Promise<string> {
    const u = new URL("https://graph.instagram.com/access_token");
    u.searchParams.set("grant_type", "ig_exchange_token");
    u.searchParams.set("client_secret", appSecret);
    u.searchParams.set("access_token", shortLivedToken);
    const json = (await this.graphGet(
      u,
    )) as LongLivedTokenResponse & MetaErrorBody;
    const token = json.access_token?.trim();
    if (!token) {
      throw new BadGatewayException(
        json.error?.message ||
          "Instagram did not return a long-lived access token",
      );
    }
    return token;
  }

  private async fetchInstagramMe(accessToken: string): Promise<InstagramMeResponse> {
    const u = new URL(
      `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/me`,
    );
    u.searchParams.set("fields", "user_id,username,name,account_type");
    u.searchParams.set("access_token", accessToken);
    return this.graphGet<InstagramMeResponse>(u);
  }

  private async graphGet<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
    return this.readJson<T>(response);
  }

  private async readJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    let json: T & MetaErrorBody = {} as T & MetaErrorBody;
    if (text) {
      try {
        json = JSON.parse(text) as T & MetaErrorBody;
      } catch {
        throw new BadGatewayException("Instagram API returned invalid JSON");
      }
    }
    if (!response.ok) {
      throw new BadGatewayException(
        json.error?.message ||
          json.error_message ||
          `Instagram API HTTP ${response.status}`,
      );
    }
    return json;
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

  private async requireWorkspaceForOwner(
    ownerId: number,
    workspaceId?: number,
  ): Promise<Workspace> {
    if (workspaceId != null) {
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

  private extractBearerToken(
    jwtFromQuery: string | undefined,
    authHeader: string | undefined,
  ): string | undefined {
    const q = jwtFromQuery?.trim();
    if (q) return q;
    const h = authHeader?.trim();
    if (h?.toLowerCase().startsWith("bearer ")) {
      return h.slice(7).trim();
    }
    return undefined;
  }

  private requireInstagramRedirectUri(): string {
    const v =
      this.config.get<string>("INSTAGRAM_REDIRECT_URI")?.trim() ??
      this.config.get<string>("IG_REDIRECT_URI")?.trim();
    if (!v) {
      throw new BadRequestException(
        "INSTAGRAM_REDIRECT_URI (or IG_REDIRECT_URI) is not configured. " +
          "Add it in Meta App → Instagram → API setup with Instagram login → Business login settings → OAuth redirect URIs.",
      );
    }
    return v;
  }

  /**
   * Instagram Login uses the Instagram App ID from Business login settings,
   * not the Facebook App ID. Using FB_APP_ID yields "Invalid platform app".
   */
  private requireInstagramAppId(): string {
    const v =
      this.config.get<string>("INSTAGRAM_APP_ID")?.trim() ??
      this.config.get<string>("IG_APP_ID")?.trim();
    if (!v) {
      throw new BadRequestException(
        "INSTAGRAM_APP_ID (or IG_APP_ID) is not configured. " +
          "Copy Instagram App ID from Meta App Dashboard → Instagram → " +
          "API setup with Instagram login → Business login settings. " +
          "Do not use FB_APP_ID here.",
      );
    }
    return v;
  }

  private requireInstagramAppSecret(): string {
    const v =
      this.config.get<string>("INSTAGRAM_APP_SECRET")?.trim() ??
      this.config.get<string>("IG_APP_SECRET")?.trim();
    if (!v) {
      throw new BadRequestException(
        "INSTAGRAM_APP_SECRET (or IG_APP_SECRET) is not configured. " +
          "Copy Instagram App Secret from the same Business login settings screen. " +
          "Do not use FB_APP_SECRET here.",
      );
    }
    return v;
  }
}
