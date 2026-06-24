import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { InstagramIntegration } from "../database/entities";
import type { InstagramIntegrationListItemDto } from "./dto/instagram-integration-list-item.dto";

type InstagramBusinessProfileNode = {
  id?: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
  has_profile_pic?: boolean;
  followers_count?: number;
  media_count?: number;
};

type InstagramErrorResponse = {
  error?: {
    message?: string;
    code?: number;
  };
};

@Injectable()
export class InstagramIntegrationProfileService {
  private readonly log = new Logger(InstagramIntegrationProfileService.name);

  async mapRow(row: InstagramIntegration): Promise<InstagramIntegrationListItemDto> {
    const fallbackName =
      row.facebookPageName?.trim() ||
      row.name?.trim() ||
      `Instagram #${row.id}`;
    const connectedAt = row.tokenConnectedAt;
    const businessAccountId = row.instagramAccountId?.trim();

    let name = fallbackName;
    let userName: string | undefined;
    let avatar: string | null = null;
    let followersCount: number | undefined;
    let postsCount: number | undefined;

    if (businessAccountId) {
      const profile = await this.fetchBusinessProfile(row, businessAccountId);
      if (profile) {
        name = profile.name?.trim() || fallbackName;
        const username = profile.username?.trim();
        if (username) {
          userName = username;
        }
        avatar = profile.profile_picture_url?.trim() || null;
        if (typeof profile.followers_count === "number") {
          followersCount = profile.followers_count;
        }
        if (typeof profile.media_count === "number") {
          postsCount = profile.media_count;
        }
      }
    }

    return {
      type: "instagram",
      id: row.id,
      name,
      ...(businessAccountId ? { businessAccountId } : {}),
      ...(userName ? { userName } : {}),
      avatar,
      ...(followersCount != null ? { followersCount } : {}),
      ...(postsCount != null ? { postsCount } : {}),
      ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
        : {}),
    };
  }

  async mapRows(
    rows: InstagramIntegration[],
  ): Promise<InstagramIntegrationListItemDto[]> {
    return Promise.all(rows.map((row) => this.mapRow(row)));
  }

  private resolveProfileAccessToken(row: InstagramIntegration): string | null {
    // IG User `profile_picture_url` requires a User access token, not Page token.
    return row.userAccessToken?.trim() || row.accessToken?.trim() || null;
  }

  private async fetchBusinessProfile(
    row: InstagramIntegration,
    businessAccountId: string,
  ): Promise<InstagramBusinessProfileNode | null> {
    const accessToken = this.resolveProfileAccessToken(row);
    if (!accessToken) {
      return null;
    }

    try {
      const url = new URL(
        `https://graph.facebook.com/v25.0/${encodeURIComponent(businessAccountId)}`,
      );
      url.searchParams.set(
        "fields",
        "id,name,username,profile_picture_url,has_profile_pic,followers_count,media_count",
      );
      url.searchParams.set("access_token", accessToken);
      return await this.instagramGraphFetch<InstagramBusinessProfileNode>(url);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Instagram profile fetch failed integrationId=${row.id} businessAccountId=${businessAccountId}: ${err}`,
      );
      return null;
    }
  }

  private async instagramGraphFetch<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
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

    if (!response.ok) {
      const err = body as InstagramErrorResponse;
      const msg =
        err?.error?.message ??
        `Instagram Graph API request failed with status ${response.status}`;
      throw new BadGatewayException(msg);
    }

    return body as T;
  }
}
