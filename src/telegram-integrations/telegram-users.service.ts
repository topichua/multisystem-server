import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import { Repository } from "typeorm";
import { TelegramIntegration, TelegramUser } from "../database/entities";
import { CloudflareImagesService } from "../products/cloudflare-images.service";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

const PROFILE_RESYNC_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TelegramUsersService {
  private readonly log = new Logger(TelegramUsersService.name);

  constructor(
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepo: Repository<TelegramUser>,
    @InjectRepository(TelegramIntegration)
    private readonly telegramIntegrationRepo: Repository<TelegramIntegration>,
    private readonly cloudflareImages: CloudflareImagesService,
    private readonly telegramApi: TelegramUserApiService,
    private readonly updatesListener: TelegramUpdatesListenerService,
  ) {}

  /**
   * Syncs a participant using a live listener client when available, otherwise
   * opens a short-lived session client from the integration.
   */
  async syncParticipantForIntegration(
    integration: TelegramIntegration,
    participantId: string,
    connectedClient?: TelegramClient,
  ): Promise<void> {
    const listenerClient =
      connectedClient ?? this.updatesListener.getActiveClient(integration.id);
    if (listenerClient) {
      await this.syncParticipantFromClient(listenerClient, participantId);
      return;
    }

    const session = integration.sessionString?.trim();
    if (!session) {
      return;
    }

    const client = this.telegramApi.createConnectedClient(session);
    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        return;
      }
      await this.syncParticipantFromClient(client, participantId);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `telegram_users sync failed integrationId=${integration.id} participantId=${participantId}: ${err}`,
      );
    } finally {
      await this.telegramApi.destroyClient(client);
    }
  }

  /**
   * Best-effort profile fetch for conversations whose participant is not in `telegram_users` yet.
   * Used by GET /conversations when serving Telegram threads.
   */
  async syncMissingParticipantsForConversations(
    conversations: Array<{ externalSourceId: string; participantId: string }>,
  ): Promise<void> {
    const byIntegration = new Map<number, Set<string>>();
    for (const conv of conversations) {
      const participantId = conv.participantId?.trim();
      if (!participantId || participantId === "unknown" || !/^\d+$/.test(participantId)) {
        continue;
      }
      const integrationId = Number(conv.externalSourceId?.trim());
      if (!Number.isInteger(integrationId) || integrationId <= 0) {
        continue;
      }
      const bucket = byIntegration.get(integrationId) ?? new Set<string>();
      bucket.add(participantId);
      byIntegration.set(integrationId, bucket);
    }
    if (byIntegration.size === 0) {
      return;
    }

    for (const [integrationId, participantIds] of byIntegration) {
      const integration = await this.telegramIntegrationRepo.findOne({
        where: { id: integrationId },
      });
      if (!integration) {
        continue;
      }
      const connectedClient = this.updatesListener.getActiveClient(integrationId);
      for (const participantId of participantIds) {
        try {
          await this.syncParticipantForIntegration(
            integration,
            participantId,
            connectedClient,
          );
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.log.warn(
            `telegram_users sync on GET failed integrationId=${integrationId} participantId=${participantId}: ${err}`,
          );
        }
      }
    }
  }

  /** Upserts participant profile when a private Telegram message is persisted. */
  async syncParticipantFromClient(
    client: TelegramClient,
    participantId: string,
  ): Promise<void> {
    const id = participantId.trim();
    if (!id || id === "unknown" || !/^\d+$/.test(id)) {
      return;
    }

    const now = new Date();
    const existing = await this.telegramUserRepo.findOne({ where: { id } });
    const needsFullSync =
      !existing ||
      !existing.syncedAt ||
      now.getTime() - existing.syncedAt.getTime() > PROFILE_RESYNC_MS;

    if (!needsFullSync) {
      existing.lastSeen = now;
      await this.telegramUserRepo.save(existing);
      return;
    }

    let entity: unknown;
    try {
      entity = await client.getEntity(id);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram getEntity failed id=${id}: ${err}`);
      return;
    }

    if (!(entity instanceof Api.User) || entity instanceof Api.UserEmpty) {
      return;
    }

    const firstName = entity.firstName?.trim() || "";
    const lastName = entity.lastName?.trim() || null;
    const username = entity.username?.trim() || null;
    let profilePic = existing?.profilePic?.trim() || "";

    if (entity.photo) {
      const uploaded = await this.uploadProfilePhoto(client, entity, id);
      if (uploaded) {
        profilePic = uploaded;
      }
    }

    if (!existing) {
      await this.telegramUserRepo.save(
        this.telegramUserRepo.create({
          id,
          firstName,
          lastName,
          username,
          profilePic,
          syncedAt: now,
          lastSeen: now,
        }),
      );
      return;
    }

    existing.firstName = firstName;
    existing.lastName = lastName;
    existing.username = username;
    existing.profilePic = profilePic;
    existing.syncedAt = now;
    existing.lastSeen = now;
    await this.telegramUserRepo.save(existing);
  }

  static buildDisplayName(user: {
    firstName: string;
    lastName: string | null;
    username: string | null;
    id: string;
  }): string {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return fullName || user.username?.trim() || user.id;
  }

  private async uploadProfilePhoto(
    client: TelegramClient,
    user: Api.User,
    userId: string,
  ): Promise<string | null> {
    try {
      const downloaded = await client.downloadProfilePhoto(user, {
        isBig: false,
      });
      if (downloaded == null) {
        return null;
      }
      const buffer = Buffer.isBuffer(downloaded)
        ? downloaded
        : Buffer.from(downloaded);
      if (buffer.length === 0) {
        return null;
      }

      const uploaded = await this.cloudflareImages.uploadImage({
        buffer,
        mimetype: "image/jpeg",
        originalname: `telegram-user-${userId}.jpg`,
      });
      return uploaded.cdnUrl;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Telegram profile photo upload failed userId=${userId}: ${err}`,
      );
      return null;
    }
  }
}
