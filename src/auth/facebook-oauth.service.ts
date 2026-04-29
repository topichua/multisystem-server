import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { Company, Source } from '../database/entities';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { FacebookOAuthStatusDto } from './dto/facebook-oauth-status.dto';

const GRAPH_VERSION = 'v25.0';

/**
 * Scopes passed to `www.facebook.com/.../dialog/oauth`.
 * Do **not** include `pages_messaging` or `pages_manage_metadata` here — Meta often
 * shows “Invalid Scopes” for those in the standard Login dialog until the app has
 * the right use cases enabled; they are still obtainable via App Review / token
 * flows. Override with `FACEBOOK_OAUTH_SCOPES` or `FB_OAUTH_SCOPES` in `.env` if needed.
 */
const DEFAULT_OAUTH_SCOPES = [
  'pages_show_list',
  'business_management',
  'instagram_basic',
  'instagram_manage_messages',
  'pages_read_engagement',
];

const TOKEN_STATUS_ACTIVE = 'active';
const SOURCE_NAME_INSTAGRAM = 'Instagram';

const STATE_TTL_MS = 15 * 60 * 1000;

type PendingOAuth = {
  userId: number;
  companyId: number;
  expiresAt: number;
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
  private readonly pendingByState = new Map<string, PendingOAuth>();

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
  ) {
    setInterval(() => this.sweepExpiredStates(), 60_000).unref?.();
  }

  private sweepExpiredStates(): void {
    const now = Date.now();
    for (const [k, v] of this.pendingByState.entries()) {
      if (v.expiresAt <= now) this.pendingByState.delete(k);
    }
  }

  private maskToken(t: string): string {
    if (t.length <= 8) return '***';
    return `${t.slice(0, 4)}…${t.slice(-4)} (len=${t.length})`;
  }

  /**
   * Build Facebook Login redirect URL. Caller must respond with 302 to this URL.
   */
  async buildAuthorizeRedirectUrl(
    jwtFromQuery: string | undefined,
    authHeader: string | undefined,
  ): Promise<string> {
    const appId = this.requireEnvEither('FACEBOOK_APP_ID', 'FB_APP_ID');
    const redirectUri = this.requireEnvEither(
      'FACEBOOK_REDIRECT_URI',
      'FB_REDIRECT_URI',
    );

    const rawToken = this.extractBearerToken(jwtFromQuery, authHeader);
    if (!rawToken) {
      throw new UnauthorizedException(
        'Missing JWT. After POST /auth/login, open GET /auth/facebook?jwt=YOUR_ACCESS_TOKEN (paste the token from the login response) or send Authorization: Bearer …',
      );
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT');
    }

    if (payload.sub === 'super-admin') {
      throw new ForbiddenException(
        'Facebook OAuth requires a company user. Log in as a user that owns a company, not the env super-admin login.',
      );
    }

    const userId = Number.parseInt(payload.sub, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('JWT subject must be a numeric user id');
    }

    return this.buildAuthorizeUrlForUser(userId, appId, redirectUri);
  }

  private async buildAuthorizeUrlForUser(
    userId: number,
    appId: string,
    redirectUri: string,
  ): Promise<string> {
    const row = await this.companyRepo.findOne({
      where: { ownerId: userId },
      order: { id: 'DESC' },
    });
    if (!row) {
      throw new NotFoundException('No company found for this user; create a company first.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    this.pendingByState.set(state, {
      userId,
      companyId: row.id,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    this.sweepExpiredStates();

    this.log.log(
      `Facebook OAuth start companyId=${row.id} userId=${userId} state=${state.slice(0, 8)}…`,
    );

    const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    u.searchParams.set('client_id', appId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', this.getOAuthScopeQueryValue());

    return u.toString();
  }

  /** Comma-separated scope string for the OAuth dialog. */
  private getOAuthScopeQueryValue(): string {
    const override =
      this.config.get<string>('FACEBOOK_OAUTH_SCOPES')?.trim() ??
      this.config.get<string>('FB_OAUTH_SCOPES')?.trim();
    if (override != null && override.length > 0) return override;
    return DEFAULT_OAUTH_SCOPES.join(',');
  }

  private extractBearerToken(
    jwtFromQuery: string | undefined,
    authHeader: string | undefined,
  ): string | undefined {
    const q = jwtFromQuery?.trim();
    if (q) return q;
    const h = authHeader?.trim();
    if (h?.toLowerCase().startsWith('bearer ')) {
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
        `Facebook OAuth error from provider error=${oauthError} description=${oauthErrorDescription ?? ''}`,
      );
      throw new BadRequestException(
        oauthErrorDescription ?? oauthError ?? 'Facebook OAuth failed',
      );
    }

    if (!code?.trim()) {
      throw new BadRequestException('Missing authorization code');
    }
    if (!state?.trim()) {
      throw new BadRequestException('Missing state parameter');
    }

    const pending = this.pendingByState.get(state.trim());
    if (!pending || pending.expiresAt < Date.now()) {
      this.log.warn('Facebook OAuth invalid or expired state');
      throw new BadRequestException('Invalid or expired state; start again from GET /auth/facebook');
    }
    this.pendingByState.delete(state.trim());

    const appId = this.requireEnvEither('FACEBOOK_APP_ID', 'FB_APP_ID');
    const appSecret = this.requireEnvEither(
      'FACEBOOK_APP_SECRET',
      'FB_APP_SECRET',
    );
    const redirectUri = this.requireEnvEither(
      'FACEBOOK_REDIRECT_URI',
      'FB_REDIRECT_URI',
    );

    this.log.log(
      `Facebook OAuth callback exchanging code (companyId=${pending.companyId} userId=${pending.userId})`,
    );

    const shortLived = await this.exchangeCodeForShortLivedUserToken(
      appId,
      appSecret,
      redirectUri,
      code.trim(),
    );
    this.log.log(`Short-lived user token received ${this.maskToken(shortLived)}`);

    const longLived = await this.exchangeForLongLivedUserToken(
      appId,
      appSecret,
      shortLived,
    );
    this.log.log(`Long-lived user token received ${this.maskToken(longLived)}`);

    const page = await this.findPageWithInstagramBusinessAccount(
      longLived,
      pending.companyId,
    );
    const igId = page.instagram_business_account!.id!.trim();

    const pageId = page.id!.trim();
    const pageName = page.name?.trim() ?? '';

    this.log.log(
      `Selected Page pageId=${pageId} pageName=${pageName} instagramAccountId=${igId}`,
    );

    const company = await this.companyRepo.findOne({
      where: { id: pending.companyId, ownerId: pending.userId },
    });
    if (!company) {
      throw new NotFoundException('Company not found for OAuth state');
    }

    const now = new Date();
    company.pageId = pageId;
    company.userAccessToken = longLived;
    company.accessToken = page.access_token!.trim();
    company.instagramAccountId = igId;
    company.facebookPageName = pageName.length > 0 ? pageName : null;
    company.tokenConnectedAt = now;
    company.tokenStatus = TOKEN_STATUS_ACTIVE;
    await this.companyRepo.save(company);

    this.log.log(
      `Facebook OAuth completed companyId=${company.id} pageId=${pageId} igBiz=${igId}`,
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

  async getStatusForOwner(ownerId: number): Promise<FacebookOAuthStatusDto> {
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: 'DESC' },
    });
    if (!company) {
      throw new NotFoundException('Company not found for current user');
    }
    return {
      pageId: company.pageId?.trim() || null,
      pageName: company.facebookPageName?.trim() ?? null,
      instagramAccountId: company.instagramAccountId?.trim() ?? null,
      tokenStatus: company.tokenStatus?.trim() ?? null,
      tokenConnectedAt: company.tokenConnectedAt,
    };
  }

  private async exchangeCodeForShortLivedUserToken(
    appId: string,
    appSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<string> {
    const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    u.searchParams.set('client_id', appId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('client_secret', appSecret);
    u.searchParams.set('code', code);

    const json = await this.graphGet<OAuthTokenResponse & MetaErrorBody>(u);
    const token = json.access_token?.trim();
    if (!token) {
      this.logMetaError('short-lived token exchange', json);
      throw new BadGatewayException(
        (json as MetaErrorBody).error?.message ?? 'Failed to exchange code for access token',
      );
    }
    return token;
  }

  private async exchangeForLongLivedUserToken(
    appId: string,
    appSecret: string,
    shortLivedUserToken: string,
  ): Promise<string> {
    const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    u.searchParams.set('grant_type', 'fb_exchange_token');
    u.searchParams.set('client_id', appId);
    u.searchParams.set('client_secret', appSecret);
    u.searchParams.set('fb_exchange_token', shortLivedUserToken);

    const json = await this.graphGet<OAuthTokenResponse & MetaErrorBody>(u);
    const token = json.access_token?.trim();
    if (!token) {
      this.logMetaError('long-lived token exchange', json);
      throw new BadGatewayException(
        (json as MetaErrorBody).error?.message ?? 'Failed to exchange for long-lived user token',
      );
    }
    return token;
  }

  /**
   * Calls Graph `me/accounts` with the long-lived **user** token (`access_token` query param),
   * picks the first Page with `instagram_business_account`, persists that Page’s `access_token`
   * to `sources.token`, and returns the Page node (caller sets `company.user_access_token` and
   * `company.access_token` from the user token and `page.access_token`).
   */
  private async findPageWithInstagramBusinessAccount(
    userAccessToken: string,
    companyId: number,
  ): Promise<PageWithIg> {
    const fields = 'id,name,access_token,instagram_business_account{id}';
    let nextUrl: string | null =
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
      `?fields=${encodeURIComponent(fields)}` +
      `&access_token=${encodeURIComponent(userAccessToken)}` +
      `&limit=100`;

    const all: PageWithIg[] = [];
    while (nextUrl) {
      const batch: MeAccountsResponse = await this.graphGetUrl<MeAccountsResponse>(
        nextUrl,
      );
      all.push(...(batch.data ?? []));
      nextUrl = batch.paging?.next ?? null;
    }

    this.log.log(`me/accounts returned ${all.length} page(s)`);

    if (all.length === 0) {
      throw new BadRequestException(
        'No Facebook Pages found for this user. Add a Page and grant the app access.',
      );
    }

    const withIg = all.find(
      (p) => p.instagram_business_account?.id && p.id && p.access_token,
    );
    if (!withIg) {
      throw new BadRequestException(
        'No Instagram Business account connected to any Facebook Page. Connect Instagram to a Page in Meta Business Suite.',
      );
    }

    const pageAccessToken = withIg.access_token!.trim();
    this.log.log(
      `Persisting Page access_token to sources companyId=${companyId} token=${this.maskToken(pageAccessToken)}`,
    );

    let source = await this.sourceRepo.findOne({
      where: { companyId },
      order: { id: 'DESC' },
    });
    if (!source) {
      source = this.sourceRepo.create({
        name: SOURCE_NAME_INSTAGRAM,
        companyId,
        token: pageAccessToken,
      });
    } else {
      source.token = pageAccessToken;
    }
    await this.sourceRepo.save(source);

    return withIg;
  }

  private async graphGet<T>(url: URL): Promise<T> {
    return this.graphGetUrl<T>(url.toString());
  }

  private async graphGetUrl<T>(url: string): Promise<T> {
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    let body: T & MetaErrorBody = {} as T & MetaErrorBody;
    if (text) {
      try {
        body = JSON.parse(text) as T & MetaErrorBody;
      } catch {
        throw new BadGatewayException('Meta API returned invalid JSON');
      }
    }
    if (!response.ok) {
      this.log.warn(
        `Meta API HTTP ${response.status} body=${text.slice(0, 500)}`,
      );
      throw new BadGatewayException(
        body.error?.message ?? `Meta API request failed with status ${response.status}`,
      );
    }
    if (body.error?.message) {
      this.logMetaError('Graph response', body);
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
