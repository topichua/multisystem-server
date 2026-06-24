import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { InstagramUser } from "../database/entities";

type InstagramGraphUserNode = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
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
    accessToken: string,
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
        this.upsertFromGraph(id, accessToken).catch((e) => {
          const err = e instanceof Error ? e.message : String(e);
          this.log.warn(`instagram_users upsert failed id=${id}: ${err}`);
        }),
      ),
    );
  }

  private async upsertFromGraph(
    instagramUserId: string,
    accessToken: string,
  ): Promise<void> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(instagramUserId)}`,
    );
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url.toString());
    const bodyText = await response.text();
    let node: InstagramGraphUserNode = {};
    if (bodyText) {
      try {
        node = JSON.parse(bodyText) as InstagramGraphUserNode;
      } catch {
        throw new Error("Instagram Graph API returned invalid JSON");
      }
    }
    if (!response.ok) {
      const message =
        (node as { error?: { message?: string } }).error?.message ??
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    const name =
      node.name?.trim() ||
      node.username?.trim() ||
      node.id?.trim() ||
      instagramUserId;
    const username =
      node.username?.trim() || node.id?.trim() || instagramUserId;
    const profilePic = node.profile_pic?.trim() || "";
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
}
