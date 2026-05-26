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
import type { JwtPayload } from "./interfaces/jwt-payload.interface";
import type { FacebookOAuthStatusDto } from "./dto/facebook-oauth-status.dto";
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
  "pages_show_list",
  "business_management",
  "instagram_basic",
  "instagram_manage_messages",
  "pages_read_engagement",
];

const STATE_TTL_SECONDS = 15 * 60;

type OAuthStatePayload = {
  sub: "facebook-oauth";
  userId: number;
  workspaceId: number;
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
   * Facebook Login URL for the owner's workspace (creates `instagram_integration` only after OAuth succeeds).
   */
  async buildAuthorizeUrlForOwnerId(
    ownerId: number,
    workspaceId?: number,
  ): Promise<string> {
    const appId = this.requireEnvEither("FACEBOOK_APP_ID", "FB_APP_ID");
    const redirectUri = this.requireEnvEither(
      "FACEBOOK_REDIRECT_URI",
      "FB_REDIRECT_URI",
    );
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException("owner id must be a positive integer");
    }
    return this.buildAuthorizeUrlForUser(ownerId, appId, redirectUri, workspaceId);
  }

  private async buildAuthorizeUrlForUser(
    userId: number,
    appId: string,
    redirectUri: string,
    workspaceIdParam?: number,
  ): Promise<string> {
    const workspace =
      workspaceIdParam != null
        ? await this.requireWorkspaceForOwner(userId, workspaceIdParam)
        : await this.requireWorkspaceForOwner(userId);

    const state = this.jwtService.sign(
      {
        sub: "facebook-oauth",
        userId,
        workspaceId: workspace.id,
      } satisfies OAuthStatePayload,
      { expiresIn: STATE_TTL_SECONDS },
    );

    this.log.log(
      `Facebook OAuth start workspaceId=${workspace.id} userId=${userId} state=${state.slice(0, 8)}…`,
    );

    const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    u.searchParams.set("client_id", appId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.getOAuthScopeQueryValue());

    return u.toString();
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
  ): Promise<{
    ok: true;
    pageId: string;
    pageName: string;
    instagramAccountId: string;
    tokenConnectedAt: string;
    tokenStatus: string;
  }> {
    if (oauthError) {
      this.log.warn(
        `Facebook OAuth error from provider error=${oauthError} description=${oauthErrorDescription ?? ""}`,
      );
      throw new BadRequestException(
        oauthErrorDescription ?? oauthError ?? "Facebook OAuth failed",
      );
    }

    if (!code?.trim()) {
      throw new BadRequestException("Missing authorization code");
    }
    if (!state?.trim()) {
      throw new BadRequestException("Missing state parameter");
    }

    let pending: OAuthStatePayload;
    try {
      const decoded = this.jwtService.verify<OAuthStatePayload>(state.trim());
      if (decoded.sub !== "facebook-oauth") {
        throw new Error("unexpected state subject");
      }
      pending = decoded;
    } catch {
      this.log.warn("Facebook OAuth invalid or expired state");
      throw new BadRequestException(
        "Invalid or expired state; start again from GET /auth/facebook",
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
      `Facebook OAuth callback exchanging code (workspaceId=${pending.workspaceId} userId=${pending.userId})`,
    );

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
    this.log.log(`Long-lived user token received ${this.maskToken(longLived)}`);

    const page = await this.findPageWithInstagramBusinessAccount(longLived);
    const igId = page.instagram_business_account!.id!.trim();

    const pageId = page.id!.trim();
    const pageName = page.name?.trim() ?? "";

    this.log.log(
      `Selected Page pageId=${pageId} pageName=${pageName} instagramAccountId=${igId}`,
    );

    const workspace = await this.requireWorkspaceForOwner(
      pending.userId,
      pending.workspaceId,
    );
    const integration = await this.saveConnectedInstagramIntegration({
      workspace,
      pageId,
      pageName,
      igId,
      longLivedUserToken: longLived,
      pageAccessToken: page.access_token!.trim(),
    });
    const now = integration.tokenConnectedAt!;

    this.log.log(
      `Facebook OAuth completed workspaceId=${workspace.id} integrationId=${integration.id} pageId=${pageId} igBiz=${igId}`,
    );

    return {
      ok: true,
      pageId,
      pageName,
      instagramAccountId: igId,
      tokenConnectedAt: now.toISOString(),
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
        throw new BadRequestException("workspace id must be a positive integer");
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
        ownerId: params.workspace.ownerId,
      },
      order: { id: "DESC" },
    });

    if (existing) {
      existing.pageId = params.pageId;
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
        name: params.workspace.name,
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
   * Calls Graph `me/accounts` with the long-lived **user** token (`access_token` query param),
   * picks the first Page with `instagram_business_account`, and returns the Page node.
   */
  private async findPageWithInstagramBusinessAccount(
    userAccessToken: string,
  ): Promise<PageWithIg> {
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

    const withIg = all.find(
      (p) => p.instagram_business_account?.id && p.id && p.access_token,
    );
    if (!withIg) {
      throw new BadRequestException(
        "No Instagram Business account connected to any Facebook Page. Connect Instagram to a Page in Meta Business Suite.",
      );
    }

    this.log.log(
      `Selected Page with Instagram Business account token=${this.maskToken(withIg.access_token!.trim())}`,
    );

    return withIg;
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
