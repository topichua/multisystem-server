import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, IsNull, QueryFailedError, Repository } from "typeorm";
import { FacebookOAuthService } from "../auth/facebook-oauth.service";
import { InstagramOAuthService } from "../auth/instagram-oauth.service";
import { TikTokOAuthService } from "../auth/tiktok-oauth.service";
import {
  InstagramIntegration,
  TelegramIntegrationStatus,
  TikTokIntegration,
} from "../database/entities";
import type { TelegramIntegration } from "../database/entities";
import { TelegramIntegrationsService } from "../telegram-integrations/telegram-integrations.service";
import { NovaPoshtaIntegrationsService } from "../novaposhta-integrations/novaposhta-integrations.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspaceRoleIntegrationGrantsService } from "../workspace-access/workspace-role-integration-grants.service";
import { INTEGRATION_TYPES, type IntegrationType } from "./integration-type";
import type { CreateIntegrationRequestDto } from "./dto/http/create-integration-request.dto";
import type { CreateIntegrationResponseDto } from "./dto/http/create-integration-response.dto";
import type { IntegrationListItemDto } from "./dto/http/integration-list-item.dto";
import type { IntegrationsListResponseDto } from "./dto/http/integrations-list-response.dto";
import type {
  ConfirmInstagramIntegrationRequestDto,
  ConfirmInstagramIntegrationResponseDto,
  InstagramOAuthPendingPollResponseDto,
} from "./dto/http/instagram-oauth-pending.dto";
import type { TikTokOAuthPendingPollResponseDto } from "./dto/http/tiktok-oauth-pending.dto";
import { InstagramIntegrationProfileService } from "../instagram/instagram-integration-profile.service";

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    @InjectRepository(TikTokIntegration)
    private readonly tiktokIntegrationRepo: Repository<TikTokIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly facebookOAuth: FacebookOAuthService,
    private readonly instagramOAuth: InstagramOAuthService,
    private readonly tikTokOAuth: TikTokOAuthService,
    private readonly telegramIntegrations: TelegramIntegrationsService,
    private readonly novaPoshtaIntegrations: NovaPoshtaIntegrationsService,
    private readonly roleIntegrationGrants: WorkspaceRoleIntegrationGrantsService,
    private readonly instagramProfile: InstagramIntegrationProfileService,
  ) {}

  async startForOwner(
    ownerId: number,
    dto: CreateIntegrationRequestDto,
  ): Promise<CreateIntegrationResponseDto> {
    const type = dto.integration_type;
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);

    if (type === "instagram") {
      const started =
        dto.auth_flow === "instagram_login"
          ? await this.instagramOAuth.startInstagramLoginForOwner(
              ownerId,
              workspace.id,
            )
          : await this.facebookOAuth.startInstagramOAuthForOwner(
              ownerId,
              workspace.id,
            );
      return {
        type: "instagram",
        name: workspace.name,
        url: started.url,
        sessionId: started.sessionId,
      };
    }

    if (type === "tiktok") {
      const started = await this.tikTokOAuth.startTikTokOAuthForOwner(
        ownerId,
        workspace.id,
      );
      return {
        type: "tiktok",
        name: workspace.name,
        url: started.url,
        sessionId: started.sessionId,
      };
    }

    throw new BadRequestException(
      `integration_type "${type}" is not supported on this endpoint`,
    );
  }

  async listInstagramOAuthPagesForOwner(
    ownerId: number,
    sessionId: string,
  ): Promise<InstagramOAuthPendingPollResponseDto> {
    return this.facebookOAuth.pollPendingSessionForOwner(ownerId, sessionId);
  }

  async confirmInstagramOAuthForOwner(
    ownerId: number,
    dto: ConfirmInstagramIntegrationRequestDto,
  ): Promise<ConfirmInstagramIntegrationResponseDto> {
    return this.facebookOAuth.confirmPendingSessionForOwner(
      ownerId,
      dto.sessionId,
      dto.pageId,
    );
  }

  async pollTikTokOAuthStatusForOwner(
    ownerId: number,
    sessionId: string,
  ): Promise<TikTokOAuthPendingPollResponseDto> {
    return this.tikTokOAuth.pollPendingSessionForOwner(ownerId, sessionId);
  }

  async listForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<IntegrationsListResponseDto> {
    const workspaceId = await this.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );

    const instagramRows = await this.instagramIntegrationRepo.find({
      where: { workspaceId, accessToken: Not(IsNull()) },
      order: { id: "ASC" },
    });

    const items: IntegrationListItemDto[] = await Promise.all(
      instagramRows.map((row) => this.mapInstagramRow(row)),
    );

    const tiktokRows = await this.tiktokIntegrationRepo.find({
      where: { workspaceId, status: "CONNECTED" },
      order: { id: "ASC" },
    });
    for (const row of tiktokRows) {
      items.push(this.mapTikTokRow(row));
    }

    const telegramRows =
      await this.telegramIntegrations.findActiveByWorkspace(workspaceId);
    for (const tg of telegramRows) {
      items.push(this.mapTelegramRow(tg));
    }

    const novaPoshtaRows =
      await this.novaPoshtaIntegrations.findAllByWorkspace(workspaceId);
    for (const novaPoshta of novaPoshtaRows) {
      items.push(
        this.novaPoshtaIntegrations.mapToIntegrationListItem(novaPoshta),
      );
    }

    return { workspaceId, items };
  }

  async deleteForOwner(
    ownerId: number,
    type: string,
    id: number,
  ): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    const integrationType = this.parseIntegrationType(type);

    switch (integrationType) {
      case "instagram":
        await this.deleteInstagramForOwner(ownerId, id);
        return;
      case "tiktok":
        await this.deleteTikTokForOwner(ownerId, id);
        return;
      case "telegram":
        await this.roleIntegrationGrants.removeForIntegration("telegram", id);
        await this.telegramIntegrations.deleteForOwner(ownerId, id);
        return;
      case "novaposhta":
        await this.novaPoshtaIntegrations.deleteForOwner(ownerId, id);
        return;
    }
  }

  async updateChatAutoDistributionForOwner(
    ownerId: number,
    type: string,
    id: number,
    chatAutoDistribution: boolean,
    appRole?: string,
  ): Promise<IntegrationListItemDto> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    const integrationType = this.parseIntegrationType(type);
    if (integrationType !== "instagram" && integrationType !== "telegram") {
      throw new BadRequestException(
        "chat_auto_distribution is only supported for instagram and telegram channels",
      );
    }

    if (integrationType === "instagram") {
      const row = await this.instagramIntegrationRepo.findOne({ where: { id } });
      if (!row || row.ownerId !== ownerId) {
        throw new NotFoundException("Instagram integration not found");
      }
      await this.workspaceContext.requireWorkspaceOwner(
        ownerId,
        row.workspaceId,
        appRole,
      );
      row.chatAutoDistribution = chatAutoDistribution === true;
      const saved = await this.instagramIntegrationRepo.save(row);
      return this.mapInstagramRow(saved);
    }

    const updated =
      await this.telegramIntegrations.updateChatAutoDistributionForOwner(
        ownerId,
        id,
        chatAutoDistribution,
      );
    return this.mapTelegramRow(updated);
  }

  private parseIntegrationType(raw: string): IntegrationType {
    const type = raw.trim().toLowerCase();
    if (!(INTEGRATION_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(
        `type must be one of: ${INTEGRATION_TYPES.join(", ")}`,
      );
    }
    return type as IntegrationType;
  }

  private async deleteInstagramForOwner(
    ownerId: number,
    id: number,
  ): Promise<void> {
    const row = await this.instagramIntegrationRepo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("Instagram integration not found");
    }

    await this.workspaceContext.requireWorkspaceOwner(ownerId, row.workspaceId);

    await this.facebookOAuth.revokeIntegrationPermissionsBestEffort(row);
    await this.instagramOAuth.revokeIntegrationPermissionsBestEffort(row);
    await this.instagramOAuth.clearPendingLoginSessions(
      row.workspaceId,
      row.ownerId,
    );
    await this.roleIntegrationGrants.removeForIntegration("instagram", id);

    try {
      await this.instagramIntegrationRepo.remove(row);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === "23503"
      ) {
        throw new ConflictException(
          "Cannot delete Instagram integration while other records still reference it",
        );
      }
      throw err;
    }
  }

  private async deleteTikTokForOwner(
    ownerId: number,
    id: number,
  ): Promise<void> {
    const row = await this.tiktokIntegrationRepo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("TikTok integration not found");
    }

    await this.workspaceContext.requireWorkspaceOwner(ownerId, row.workspaceId);

    await this.tikTokOAuth.revokeIntegrationPermissionsBestEffort(row);

    try {
      await this.tiktokIntegrationRepo.remove(row);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === "23503"
      ) {
        throw new ConflictException(
          "Cannot delete TikTok integration while other records still reference it",
        );
      }
      throw err;
    }
  }

  private mapTelegramRow(row: TelegramIntegration): IntegrationListItemDto {
    const mapped = this.telegramIntegrations.mapToIntegrationListItem(row);
    return {
      type: mapped.type,
      id: mapped.id,
      name: mapped.name,
      chat_auto_distribution: mapped.chat_auto_distribution,
      ...(mapped.connectedAt ? { connectedAt: mapped.connectedAt } : {}),
      ...(mapped.status !== TelegramIntegrationStatus.ACTIVE
        ? { status: mapped.status }
        : {}),
      ...(mapped.lastError ? { lastError: mapped.lastError } : {}),
    };
  }

  private mapTikTokRow(row: TikTokIntegration): IntegrationListItemDto {
    const name =
      row.displayName?.trim() ||
      (row.username?.trim() ? `@${row.username.trim()}` : null) ||
      row.name?.trim() ||
      `TikTok #${row.id}`;
    const connectedAt = row.createdAt;
    return {
      type: "tiktok",
      id: row.id,
      name,
      ...(row.username?.trim() ? { userName: row.username.trim() } : {}),
      ...(row.avatarUrl != null ? { avatar: row.avatarUrl } : { avatar: null }),
      ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
        : {}),
      ...(row.status !== "CONNECTED" ? { status: row.status } : {}),
      ...(row.scopes?.trim() ? { scopes: row.scopes.trim() } : {}),
    };
  }

  private async mapInstagramRow(
    row: InstagramIntegration,
  ): Promise<IntegrationListItemDto> {
    return this.instagramProfile.mapRow(row);
  }

  private async resolveWorkspaceIdForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<number> {
    return this.workspaceContext.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );
  }
}
