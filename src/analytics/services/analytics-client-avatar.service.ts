import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  ClientLink,
  ClientLinkProvider,
  InstagramUser,
  TelegramUser,
} from "../../database/entities";

@Injectable()
export class AnalyticsClientAvatarService {
  constructor(
    @InjectRepository(ClientLink)
    private readonly clientLinkRepo: Repository<ClientLink>,
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepo: Repository<TelegramUser>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
  ) {}

  async resolveAvatarsByClientIds(
    workspaceId: number,
    clientIds: number[],
  ): Promise<Map<number, string | null>> {
    const result = new Map<number, string | null>();
    for (const clientId of clientIds) {
      result.set(clientId, null);
    }
    if (clientIds.length === 0) {
      return result;
    }

    const links = await this.clientLinkRepo.find({
      where: { workspaceId, clientId: In(clientIds) },
      order: { id: "ASC" },
    });
    if (links.length === 0) {
      return result;
    }

    const telegramIds = new Set<string>();
    const instagramIds = new Set<string>();
    const linksByClientId = new Map<number, ClientLink[]>();

    for (const link of links) {
      const bucket = linksByClientId.get(link.clientId) ?? [];
      bucket.push(link);
      linksByClientId.set(link.clientId, bucket);
      if (link.provider === ClientLinkProvider.TELEGRAM) {
        telegramIds.add(link.externalId);
      } else {
        instagramIds.add(link.externalId);
      }
    }

    const [telegramUsers, instagramUsers] = await Promise.all([
      telegramIds.size > 0
        ? this.telegramUserRepo.find({
            where: { workspaceId, id: In([...telegramIds]) },
            select: { id: true, profilePic: true },
          })
        : Promise.resolve([]),
      instagramIds.size > 0
        ? this.instagramUserRepo.find({
            where: { workspaceId, id: In([...instagramIds]) },
            select: { id: true, profilePic: true },
          })
        : Promise.resolve([]),
    ]);

    const telegramAvatars = new Map(
      telegramUsers.map((user) => [user.id, user.profilePic?.trim() || null]),
    );
    const instagramAvatars = new Map(
      instagramUsers.map((user) => [user.id, user.profilePic?.trim() || null]),
    );

    for (const clientId of clientIds) {
      const clientLinks = linksByClientId.get(clientId) ?? [];
      for (const link of clientLinks) {
        const avatar =
          link.provider === ClientLinkProvider.TELEGRAM
            ? telegramAvatars.get(link.externalId)
            : instagramAvatars.get(link.externalId);
        if (avatar) {
          result.set(clientId, avatar);
          break;
        }
      }
    }

    return result;
  }
}
