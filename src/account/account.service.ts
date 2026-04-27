import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountResponseDto } from './dto/account-response.dto';

type InstagramErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

/** Instagram Scoped User ID (messaging) node — User Profile API fields only. */
type InstagramScopedUserNode = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
};

@Injectable()
export class AccountService {
  constructor(private readonly config: ConfigService) {}

  async getInstagramAccount(accountId: string): Promise<AccountResponseDto> {
    const accessToken = this.getInstagramAccessToken();

    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(accountId)}`,
    );
    // Scoped customer IDs do not support IG User fields like profile_picture_url.
    // See: User Profile API (Instagram messaging).
    url.searchParams.set('fields', 'id,name,username,profile_pic');
    url.searchParams.set('access_token', accessToken);

    const node = await this.instagramGraphFetch<InstagramScopedUserNode>(url);

    const username = node.username?.trim() ?? '';
    const displayName = node.name?.trim() || username || node.id || accountId;
    const handle = username ? (username.startsWith('@') ? username : `@${username}`) : `@${accountId}`;

    const avatarUrl = node.profile_pic?.trim() || null;

    const instagramProfileUrl = username
      ? `https://instagram.com/${username.replace(/^@/, '')}`
      : `https://instagram.com/`;

    return {
      id: node.id ?? accountId,
      displayName,
      username: handle,
      avatarUrl,
      instagramProfileUrl,
      notes: null,
      labels: [],
      orders: [],
      pageName: null,
    };
  }

  private getInstagramAccessToken(): string {
    const accessToken = this.config.get<string>('INSTAGRAM_ACCESS_TOKEN')?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'INSTAGRAM_ACCESS_TOKEN is not configured',
      );
    }
    return accessToken;
  }

  private async instagramGraphFetch<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
    const bodyText = await response.text();
    let body: T | InstagramErrorResponse = {} as T;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as T | InstagramErrorResponse;
      } catch {
        throw new BadGatewayException('Instagram Graph API returned invalid JSON');
      }
    }

    if (!response.ok) {
      const message =
        (body as InstagramErrorResponse).error?.message ??
        `Instagram Graph API request failed with status ${response.status}`;
      throw new BadGatewayException(message);
    }

    return body as T;
  }
}
