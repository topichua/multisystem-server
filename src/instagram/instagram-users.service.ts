import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { InstagramUser } from "../database/entities";

type InstagramScopedUserNode = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
};

type InstagramBusinessUserNode = {
  id?: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
};

type InstagramGraphErrorBody = {
  error?: { message?: string };
};

export type InstagramUserSyncContext = {
  pageAccessToken: string;
  userAccessToken?: string | null;
  businessAccountId?: string | null;
  pageId?: string | null;
};

@Injectable()
export class InstagramUsersService {
  private readonly log = new Logger(InstagramUsersService.name);

  constructor(
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
  ) {}

  async getMapByIds(ids: string[]): Promise<Map<string, InstagramUser>> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) {
      return new Map();
    }
    const rows = await this.instagramUserRepo.find({
      where: { id: In(uniqIds) },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Upserts users that are not in `instagram_users` yet (best effort). */
  async syncMissingFromGraph(
    ids: string[],
    context: InstagramUserSyncContext,
    options?: { maxSync?: number },
  ): Promise<void> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) {
      return;
    }

    const existing = await this.getMapByIds(uniqIds);
    const missing = uniqIds.filter((id) => !existing.has(id));
    const maxSync = options?.maxSync ?? 25;
    const toSync = missing.slice(0, maxSync);

    await Promise.all(
      toSync.map((id) =>
        this.upsertFromGraph(id, context).catch((e) => {
          const err = e instanceof Error ? e.message : String(e);
          this.log.warn(`instagram_users upsert failed id=${id}: ${err}`);
        }),
      ),
    );
  }

  private async upsertFromGraph(
    instagramUserId: string,
    context: InstagramUserSyncContext,
  ): Promise<void> {
    const id = instagramUserId.trim();
    if (this.isConnectedBusinessAccount(id, context)) {
      await this.upsertBusinessAccountFromGraph(id, context);
      return;
    }

    await this.upsertScopedUserFromGraph(id, context.pageAccessToken);
  }

  private isConnectedBusinessAccount(
    instagramUserId: string,
    context: InstagramUserSyncContext,
  ): boolean {
    const id = instagramUserId.trim();
    const businessAccountId = context.businessAccountId?.trim();
    const pageId = context.pageId?.trim();
    return (
      (!!businessAccountId && id === businessAccountId) ||
      (!!pageId && id === pageId)
    );
  }

  /** Instagram messaging / comment participant (scoped id). */
  private async upsertScopedUserFromGraph(
    instagramUserId: string,
    pageAccessToken: string,
  ): Promise<void> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(instagramUserId)}`,
    );
    url.searchParams.set("fields", "id,name,username,profile_pic");
    url.searchParams.set("access_token", pageAccessToken);

    const node = await this.graphFetch<InstagramScopedUserNode>(url);
    await this.saveUserRow({
      id: instagramUserId,
      name: node.name,
      username: node.username,
      profilePic: node.profile_pic,
    });
  }

  /** Connected Instagram Business/Creator account (your own profile). */
  private async upsertBusinessAccountFromGraph(
    instagramUserId: string,
    context: InstagramUserSyncContext,
  ): Promise<void> {
    const accessToken =
      context.userAccessToken?.trim() || context.pageAccessToken.trim();
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(instagramUserId)}`,
    );
    url.searchParams.set("fields", "id,name,username,profile_picture_url");
    url.searchParams.set("access_token", accessToken);

    const node = await this.graphFetch<InstagramBusinessUserNode>(url);
    await this.saveUserRow({
      id: instagramUserId,
      name: node.name,
      username: node.username,
      profilePic: node.profile_picture_url,
    });
  }

  private async saveUserRow(params: {
    id: string;
    name?: string;
    username?: string;
    profilePic?: string;
  }): Promise<void> {
    const instagramUserId = params.id.trim();
    const name =
      params.name?.trim() ||
      params.username?.trim() ||
      instagramUserId;
    const username =
      params.username?.trim() || instagramUserId;
    const profilePic = params.profilePic?.trim() || "";
    const now = new Date();

    let row = await this.instagramUserRepo.findOne({
      where: { id: instagramUserId },
    });
    if (!row) {
      row = this.instagramUserRepo.create({
        id: instagramUserId,
        name,
        username,
        profilePic,
        syncedAt: now,
        lastSeen: now,
      });
    } else {
      row.name = name;
      row.username = username;
      row.profilePic = profilePic;
      row.syncedAt = now;
      row.lastSeen = now;
    }
    await this.instagramUserRepo.save(row);
  }

  private async graphFetch<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
    const bodyText = await response.text();
    let body: T | InstagramGraphErrorBody = {} as T;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as T | InstagramGraphErrorBody;
      } catch {
        throw new Error("Instagram Graph API returned invalid JSON");
      }
    }
    if (!response.ok) {
      const message =
        (body as InstagramGraphErrorBody).error?.message ??
        `HTTP ${response.status}`;
      throw new Error(message);
    }
    return body as T;
  }
}
