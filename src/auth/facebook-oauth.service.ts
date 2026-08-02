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
import { InstagramIntegration, Workspace } from "../database/entities";
import {
  InstagramOAuthPendingSession,
  type InstagramOAuthPendingPage,
} from "../database/entities/instagram-oauth-pending-session.entity";
import type { JwtPayload } from "./interfaces/jwt-payload.interface";
import type { FacebookOAuthStatusDto } from "./dto/facebook-oauth-status.dto";
import type {
  ConfirmInstagramIntegrationResponseDto,
  InstagramOAuthPageOptionDto,
  InstagramOAuthPendingPollResponseDto,
} from "../integrations/dto/http/instagram-oauth-pending.dto";
const TOKEN_STATUS_ACTIVE = "active";

const GRAPH_VERSION = "v25.0";

/**
 * Scopes passed to `www.facebook.com/.../dialog/oauth`.
 *
 * Do **not** include `pages_messaging` or `pages_manage_metadata` here unless Meta
 * shows them as valid for your app (App Review + use case enabled). Otherwise the
 * dialog fails with “Invalid Scopes” in Development.
 *
 * Instagram DMs use `instagram_manage_messages` on the Page token. After App Review,
 * you may add Page messaging scopes via `FACEBOOK_OAUTH_SCOPES` / `FB_OAUTH_SCOPES`.
 */
const DEFAULT_OAUTH_SCOPES = [
  // "pages_show_list",
  "business_management",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  //"pages_read_engagement",
];

const STATE_TTL_SECONDS = 15 * 60;
const PENDING_SESSION_TTL_MS = 30 * 60 * 1000;

type OAuthStatePayload = {
  sub: "facebook-oauth";
  userId: number;
  workspaceId: number;
  sessionId: string;
};

type MetaErrorBody = {
  error?: { message?: string; type?: string; code?: number };
};

type OAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type PageWithIg = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string } | null;
};

type MeAccountsResponse = {
  data?: PageWithIg[];
  paging?: { next?: string };
};

@Injectable()
export class FacebookOAuthService {
  private readonly log = new Logger(FacebookOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    @InjectRepository(InstagramOAuthPendingSession)
    private readonly pendingSessionRepo: Repository<InstagramOAuthPendingSession>,
  ) {}

  private maskToken(t: string): string {
    if (t.length <= 8) return "***";
    return `${t.slice(0, 4)}…${t.slice(-4)} (len=${t.length})`;
  }

  /**
   * Build Facebook Login redirect URL. Caller must respond with 302 to this URL.
   */
  async buildAuthorizeRedirectUrl(
    jwtFromQuery: string | undefined,
    authHeader: string | undefined,
  ): Promise<string> {
    const appId = this.requireEnvEither("FACEBOOK_APP_ID", "FB_APP_ID");
    const redirectUri = this.requireEnvEither(
      "FACEBOOK_REDIRECT_URI",
      "FB_REDIRECT_URI",
    );

    const rawToken = this.extractBearerToken(jwtFromQuery, authHeader);
    if (!rawToken) {
      throw new UnauthorizedException(
        "Missing JWT. After POST /auth/login, open GET /auth/facebook?jwt=YOUR_ACCESS_TOKEN (paste the token from the login response) or send Authorization: Bearer …",
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
        "Facebook OAuth requires a workspace owner. Log in as a user that owns a workspace, not the env super-admin login.",
      );
    }

    const userId = Number.parseInt(payload.sub, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException("JWT subject must be a numeric user id");
    }

    return this.buildAuthorizeUrlForOwnerId(userId);
  }

  /**
   * Facebook Login URL for the owner's workspace.
   * Creates a correlation `sessionId` the client should poll until pages are ready.
   */
  async startInstagramOAuthForOwner(
    ownerId: number,
    workspaceId?: number,
  ): Promise<{ url: string; sessionId: string; expiresAt: string }> {
    const appId = this.requireEnvEither("FACEBOOK_APP_ID", "FB_APP_ID");
    const redirectUri = this.requireEnvEither(
      "FACEBOOK_REDIRECT_URI",
      "FB_REDIRECT_URI",
    );
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
        status: "awaiting_facebook",
        userAccessToken: null,
        pages: [],
        errorMessage: null,
        expiresAt,
      }),
    );

    const url = await this.buildAuthorizeUrlForSession(
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

  /**
   * @deprecated Prefer `startInstagramOAuthForOwner` which returns a pollable sessionId.
   */
  async buildAuthorizeUrlForOwnerId(
    ownerId: number,
    workspaceId?: number,
  ): Promise<string> {
    const started = await this.startInstagramOAuthForOwner(
      ownerId,
      workspaceId,
    );
    return started.url;
  }

  private async buildAuthorizeUrlForSession(
    userId: number,
    workspaceId: number,
    sessionId: string,
    appId: string,
    redirectUri: string,
  ): Promise<string> {
    const state = this.jwtService.sign(
      {
        sub: "facebook-oauth",
        userId,
        workspaceId,
        sessionId,
      } satisfies OAuthStatePayload,
      { expiresIn: STATE_TTL_SECONDS },
    );

    this.log.log(
      `Facebook OAuth start workspaceId=${workspaceId} userId=${userId} sessionId=${sessionId} state=${state.slice(0, 8)}…`,
    );

    const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    u.searchParams.set("client_id", appId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.getOAuthScopeQueryValue());

    return u.toString();
  }

  private async buildAuthorizeUrlForUser(
    userId: number,
    appId: string,
    redirectUri: string,
    workspaceIdParam?: number,
  ): Promise<string> {
    const started = await this.startInstagramOAuthForOwner(
      userId,
      workspaceIdParam,
    );
    return started.url;
  }

  /** Comma-separated scope string for the OAuth dialog. */
  private getOAuthScopeQueryValue(): string {
    const override =
      this.config.get<string>("FACEBOOK_OAUTH_SCOPES")?.trim() ??
      this.config.get<string>("FB_OAUTH_SCOPES")?.trim();
    if (override != null && override.length > 0) return override;
    return DEFAULT_OAUTH_SCOPES.join(",");
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

  /** Supports `FACEBOOK_*` names or shorter `FB_*` aliases from `.env`. */
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
        if (decoded.sub === "facebook-oauth" && decoded.sessionId) {
          pending = decoded;
        }
      } catch {
        pending = null;
      }
    }

    if (oauthError) {
      const message =
        oauthErrorDescription ?? oauthError ?? "Facebook OAuth failed";
      this.log.warn(
        `Facebook OAuth error from provider error=${oauthError} description=${oauthErrorDescription ?? ""}`,
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
      this.log.warn("Facebook OAuth invalid or expired state");
      throw new BadRequestException(
        "Invalid or expired state; start again from POST /integrations",
      );
    }

    const appId = this.requireEnvEither("FACEBOOK_APP_ID", "FB_APP_ID");
    const appSecret = this.requireEnvEither(
      "FACEBOOK_APP_SECRET",
      "FB_APP_SECRET",
    );
    const redirectUri = this.requireEnvEither(
      "FACEBOOK_REDIRECT_URI",
      "FB_REDIRECT_URI",
    );

    this.log.log(
      `Facebook OAuth callback exchanging code (workspaceId=${pending.workspaceId} userId=${pending.userId} sessionId=${pending.sessionId})`,
    );

    try {
      const shortLived = await this.exchangeCodeForShortLivedUserToken(
        appId,
        appSecret,
        redirectUri,
        code.trim(),
      );
      this.log.log(
        `Short-lived user token received ${this.maskToken(shortLived)}`,
      );

      const longLived = await this.exchangeForLongLivedUserToken(
        appId,
        appSecret,
        shortLived,
      );
      this.log.log(
        `Long-lived user token received ${this.maskToken(longLived)}`,
      );

      const pages = await this.listPagesWithInstagramBusinessAccount(longLived);
      const session = await this.requirePendingSessionForOwner(
        pending.userId,
        pending.sessionId,
        { allowAwaiting: true },
      );

      session.userAccessToken = longLived;
      session.pages = pages;
      session.status = "select_page";
      session.errorMessage = null;
      session.expiresAt = new Date(Date.now() + PENDING_SESSION_TTL_MS);
      await this.pendingSessionRepo.save(session);

      this.log.log(
        `Facebook OAuth pending session=${session.id} ready pages=${pages.length}`,
      );

      return {
        ok: true,
        sessionId: session.id,
        status: "select_page",
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Facebook OAuth failed";
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
  ): Promise<InstagramOAuthPendingPollResponseDto> {
    const session = await this.requirePendingSessionForOwner(
      ownerId,
      sessionId,
      { allowAwaiting: true, allowFailed: true },
    );
    return {
      sessionId: session.id,
      status: session.status,
      pages:
        session.status === "select_page"
          ? session.pages.map((page) => this.toPageOptionDto(page))
          : [],
      expiresAt: session.expiresAt.toISOString(),
      ...(session.status === "failed"
        ? { error: session.errorMessage }
        : { error: null }),
    };
  }

  /** @deprecated Use pollPendingSessionForOwner */
  async listPendingPagesForOwner(
    ownerId: number,
    sessionId: string,
  ): Promise<InstagramOAuthPendingPollResponseDto> {
    return this.pollPendingSessionForOwner(ownerId, sessionId);
  }

  async confirmPendingSessionForOwner(
    ownerId: number,
    sessionId: string,
    pageIdRaw: string,
  ): Promise<ConfirmInstagramIntegrationResponseDto> {
    const pageId = pageIdRaw.trim();
    if (!pageId) {
      throw new BadRequestException("pageId is required");
    }

    const session = await this.requirePendingSessionForOwner(
      ownerId,
      sessionId,
    );
    if (session.status !== "select_page") {
      throw new BadRequestException(
        "Facebook Login is not finished yet. Keep polling until status is select_page.",
      );
    }
    if (!session.userAccessToken) {
      throw new BadRequestException(
        "Pending OAuth session is missing user token; start again from POST /integrations",
      );
    }

    const selected = session.pages.find((page) => page.pageId === pageId);
    if (!selected) {
      throw new BadRequestException(
        "pageId is not available in this OAuth session. Pick a page from the poll response.",
      );
    }

    const workspace = await this.requireWorkspaceForOwner(
      ownerId,
      session.workspaceId,
    );
    const integration = await this.saveConnectedInstagramIntegration({
      workspace,
      pageId: selected.pageId,
      pageName: selected.pageName,
      igId: selected.instagramAccountId,
      longLivedUserToken: session.userAccessToken,
      pageAccessToken: selected.pageAccessToken,
    });

    await this.pendingSessionRepo.delete({ id: session.id });

    this.log.log(
      `Instagram integration confirmed workspaceId=${workspace.id} integrationId=${integration.id} pageId=${selected.pageId}`,
    );

    return {
      ok: true,
      id: integration.id,
      pageId: selected.pageId,
      pageName: selected.pageName,
      instagramAccountId: selected.instagramAccountId,
      tokenConnectedAt: integration.tokenConnectedAt!.toISOString(),
      tokenStatus: TOKEN_STATUS_ACTIVE,
    };
  }

  /** Revoke Meta app permissions for a stored user token (best effort). */
  async revokeIntegrationPermissionsBestEffort(
    integration: InstagramIntegration,
  ): Promise<void> {
    const userToken = integration.userAccessToken?.trim();
    if (userToken) {
      await this.revokeMetaPermissionsBestEffort(userToken);
    }
  }

  async getStatusForOwner(
    ownerId: number,
    workspaceId?: number,
  ): Promise<FacebookOAuthStatusDto> {
    const workspace = await this.requireWorkspaceForOwner(ownerId, workspaceId);
    const integration = await this.instagramIntegrationRepo.findOne({
      where: { workspaceId: workspace.id, ownerId },
      order: { id: "DESC" },
    });
    if (!integration) {
      return {
        pageId: null,
        pageName: null,
        instagramAccountId: null,
        tokenStatus: null,
        tokenConnectedAt: null,
      };
    }
    return {
      pageId: integration.pageId?.trim() || null,
      pageName: integration.facebookPageName?.trim() ?? null,
      instagramAccountId: integration.instagramAccountId?.trim() ?? null,
      tokenStatus: integration.tokenStatus?.trim() ?? null,
      tokenConnectedAt: integration.tokenConnectedAt,
    };
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

  private async saveConnectedInstagramIntegration(params: {
    workspace: Workspace;
    pageId: string;
    pageName: string;
    igId: string;
    longLivedUserToken: string;
    pageAccessToken: string;
  }): Promise<InstagramIntegration> {
    const now = new Date();
    const existing = await this.instagramIntegrationRepo.findOne({
      where: {
        workspaceId: params.workspace.id,
        pageId: params.pageId,
      },
      order: { id: "DESC" },
    });

    const displayName =
      params.pageName.length > 0
        ? params.pageName
        : `Instagram ${params.pageId}`;

    if (existing) {
      existing.name = displayName;
      existing.userAccessToken = params.longLivedUserToken;
      existing.accessToken = params.pageAccessToken;
      existing.instagramAccountId = params.igId;
      existing.facebookPageName =
        params.pageName.length > 0 ? params.pageName : null;
      existing.tokenConnectedAt = now;
      existing.tokenStatus = TOKEN_STATUS_ACTIVE;
      return this.instagramIntegrationRepo.save(existing);
    }

    return this.instagramIntegrationRepo.save(
      this.instagramIntegrationRepo.create({
        name: displayName,
        pageId: params.pageId,
        userAccessToken: params.longLivedUserToken,
        accessToken: params.pageAccessToken,
        instagramAccountId: params.igId,
        facebookPageName: params.pageName.length > 0 ? params.pageName : null,
        tokenConnectedAt: now,
        tokenStatus: TOKEN_STATUS_ACTIVE,
        ownerId: params.workspace.ownerId,
        workspaceId: params.workspace.id,
      }),
    );
  }

  private async exchangeCodeForShortLivedUserToken(
    appId: string,
    appSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<string> {
    const u = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
    );
    u.searchParams.set("client_id", appId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("client_secret", appSecret);
    u.searchParams.set("code", code);

    const json = await this.graphGet<OAuthTokenResponse & MetaErrorBody>(u);
    const token = json.access_token?.trim();
    if (!token) {
      this.logMetaError("short-lived token exchange", json);
      throw new BadGatewayException(
        (json as MetaErrorBody).error?.message ??
          "Failed to exchange code for access token",
      );
    }
    return token;
  }

  private async exchangeForLongLivedUserToken(
    appId: string,
    appSecret: string,
    shortLivedUserToken: string,
  ): Promise<string> {
    const u = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
    );
    u.searchParams.set("grant_type", "fb_exchange_token");
    u.searchParams.set("client_id", appId);
    u.searchParams.set("client_secret", appSecret);
    u.searchParams.set("fb_exchange_token", shortLivedUserToken);

    const json = await this.graphGet<OAuthTokenResponse & MetaErrorBody>(u);
    const token = json.access_token?.trim();
    if (!token) {
      this.logMetaError("long-lived token exchange", json);
      throw new BadGatewayException(
        (json as MetaErrorBody).error?.message ??
          "Failed to exchange for long-lived user token",
      );
    }
    return token;
  }

  /**
   * Calls Graph `me/accounts` with the long-lived **user** token and returns every
   * Page that has an Instagram Business account (for user page selection).
   */
  private async listPagesWithInstagramBusinessAccount(
    userAccessToken: string,
  ): Promise<InstagramOAuthPendingPage[]> {
    const fields = "id,name,access_token,instagram_business_account{id}";
    let nextUrl: string | null =
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
      `?fields=${encodeURIComponent(fields)}` +
      `&access_token=${encodeURIComponent(userAccessToken)}` +
      `&limit=100`;

    const all: PageWithIg[] = [];
    while (nextUrl) {
      const batch: MeAccountsResponse =
        await this.graphGetUrl<MeAccountsResponse>(nextUrl);
      all.push(...(batch.data ?? []));
      nextUrl = batch.paging?.next ?? null;
    }

    this.log.log(`me/accounts returned ${all.length} page(s)`);

    if (all.length === 0) {
      throw new BadRequestException(
        "No Facebook Pages found for this user. Add a Page and grant the app access.",
      );
    }

    const withIg: InstagramOAuthPendingPage[] = [];
    for (const page of all) {
      const pageId = page.id?.trim();
      const pageAccessToken = page.access_token?.trim();
      const instagramAccountId = page.instagram_business_account?.id?.trim();
      if (!pageId || !pageAccessToken || !instagramAccountId) {
        continue;
      }
      withIg.push({
        pageId,
        pageName: page.name?.trim() ?? "",
        pageAccessToken,
        instagramAccountId,
      });
    }

    if (withIg.length === 0) {
      throw new BadRequestException(
        "No Instagram Business account connected to any Facebook Page. Connect Instagram to a Page in Meta Business Suite.",
      );
    }

    return withIg;
  }

  private async requirePendingSessionForOwner(
    ownerId: number,
    sessionId: string,
    options?: { allowAwaiting?: boolean; allowFailed?: boolean },
  ): Promise<InstagramOAuthPendingSession> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException("owner id must be a positive integer");
    }
    const id = sessionId?.trim();
    if (!id) {
      throw new BadRequestException("sessionId is required");
    }

    const session = await this.pendingSessionRepo.findOne({ where: { id } });
    if (!session || session.userId !== ownerId) {
      throw new NotFoundException("Instagram OAuth session not found");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.pendingSessionRepo.delete({ id: session.id });
      throw new BadRequestException(
        "Instagram OAuth session expired; start again from POST /integrations",
      );
    }
    if (
      session.status === "awaiting_facebook" &&
      options?.allowAwaiting !== true
    ) {
      throw new BadRequestException(
        "Facebook Login is not finished yet. Keep polling until status is select_page.",
      );
    }
    if (session.status === "failed" && options?.allowFailed !== true) {
      throw new BadRequestException(
        session.errorMessage ??
          "Facebook Login failed; start again from POST /integrations",
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

  private toPageOptionDto(
    page: InstagramOAuthPendingPage,
  ): InstagramOAuthPageOptionDto {
    return {
      pageId: page.pageId,
      pageName: page.pageName,
      instagramAccountId: page.instagramAccountId,
    };
  }

  /** Removes this app's permissions for the user token (Meta `DELETE /me/permissions`). */
  private async revokeMetaPermissionsBestEffort(
    userAccessToken: string,
  ): Promise<void> {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/permissions`,
    );
    url.searchParams.set("access_token", userAccessToken);
    try {
      const response = await fetch(url.toString(), { method: "DELETE" });
      const text = await response.text();
      if (!response.ok) {
        let message = text.slice(0, 300);
        try {
          const body = JSON.parse(text) as MetaErrorBody;
          message = body.error?.message ?? message;
        } catch {
          /* keep raw snippet */
        }
        this.log.warn(
          `Meta permission revoke HTTP ${response.status}: ${message}`,
        );
        return;
      }
      this.log.log("Meta permission revoke succeeded");
    } catch (err) {
      this.log.warn(
        `Meta permission revoke failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async graphGet<T>(url: URL): Promise<T> {
    return this.graphGetUrl<T>(url.toString());
  }

  private async graphGetUrl<T>(url: string): Promise<T> {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    let body: T & MetaErrorBody = {} as T & MetaErrorBody;
    if (text) {
      try {
        body = JSON.parse(text) as T & MetaErrorBody;
      } catch {
        throw new BadGatewayException("Meta API returned invalid JSON");
      }
    }
    if (!response.ok) {
      this.log.warn(
        `Meta API HTTP ${response.status} body=${text.slice(0, 500)}`,
      );
      throw new BadGatewayException(
        body.error?.message ??
          `Meta API request failed with status ${response.status}`,
      );
    }
    if (body.error?.message) {
      this.logMetaError("Graph response", body);
      throw new BadGatewayException(body.error.message);
    }
    return body;
  }

  private logMetaError(context: string, json: unknown): void {
    const e = json as MetaErrorBody;
    const msg = e?.error?.message ?? JSON.stringify(json).slice(0, 300);
    this.log.warn(`Meta API ${context}: ${msg}`);
  }
}
