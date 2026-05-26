import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { FacebookOAuthService } from "../auth/facebook-oauth.service";
import {
  InstagramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import type { TelegramIntegration } from "../database/entities";
import { TelegramIntegrationsService } from "../telegram-integrations/telegram-integrations.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import {
  INTEGRATION_TYPES,
  type IntegrationType,
} from "./integration-type";
import type { CreateIntegrationRequestDto } from "./dto/http/create-integration-request.dto";
import type { CreateIntegrationResponseDto } from "./dto/http/create-integration-response.dto";
import type { IntegrationListItemDto } from "./dto/http/integration-list-item.dto";
import type { IntegrationsListResponseDto } from "./dto/http/integrations-list-response.dto";
import {
  INSTAGRAM_TOKEN_STATUS_DISCONNECTED,
  isInstagramIntegrationConnected,
} from "./instagram-integration.util";

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly facebookOAuth: FacebookOAuthService,
    private readonly telegramIntegrations: TelegramIntegrationsService,
  ) {}

  async startForOwner(
    ownerId: number,
    dto: CreateIntegrationRequestDto,
  ): Promise<CreateIntegrationResponseDto> {
    const type = dto.integration_type;
    if (type !== "instagram") {
      throw new BadRequestException(
        `integration_type "${type}" is not supported on this endpoint`,
      );
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.findOrCreateInstagramIntegration(workspace);
    const url = await this.facebookOAuth.buildAuthorizeUrlForOwnerId(
      ownerId,
      workspace.id,
    );
    const name =
      row.facebookPageName?.trim() ||
      row.name?.trim() ||
      `Instagram #${row.id}`;
    const connected = isInstagramIntegrationConnected(row);
    const connectedAt = row.tokenConnectedAt;

    return {
      type: "instagram",
      id: row.id,
      name,
      url,
      ...(connected && connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
        : {}),
      ...(!connected ? { status: INSTAGRAM_TOKEN_STATUS_DISCONNECTED } : {}),
    };
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
      where: { workspaceId },
      order: { id: "ASC" },
    });

    const items: IntegrationListItemDto[] = instagramRows.map((row) =>
      this.mapInstagramRow(row),
    );

    const telegramRows =
      await this.telegramIntegrations.findAllByWorkspace(workspaceId);
    for (const tg of telegramRows) {
      items.push(this.mapTelegramRow(tg));
    }

    return { workspaceId, items };
  }

  async deleteForOwner(
    ownerId: number,
    type: string,
    id: number,
    options?: { permanent?: boolean },
  ): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    const integrationType = this.parseIntegrationType(type);

    switch (integrationType) {
      case "instagram":
        if (options?.permanent) {
          await this.purgeInstagramForOwner(ownerId, id);
        } else {
          await this.disconnectInstagramForOwner(ownerId, id);
        }
        return;
      case "telegram":
        await this.telegramIntegrations.deleteForOwner(ownerId, id);
        return;
    }
  }

  /** Clears Meta tokens and marks the row disconnected; row is kept for reconnect and source refs. */
  private async disconnectInstagramForOwner(
    ownerId: number,
    id: number,
  ): Promise<void> {
    const row = await this.instagramIntegrationRepo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("Instagram integration not found");
    }

    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      row.workspaceId,
    );

    if (!isInstagramIntegrationConnected(row)) {
      return;
    }

    await this.facebookOAuth.deactivateIntegrationForOwner(ownerId, id);
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

  /** Hard-deletes the integration row (only when nothing references `company_id`). */
  private async purgeInstagramForOwner(
    ownerId: number,
    id: number,
  ): Promise<void> {
    const row = await this.instagramIntegrationRepo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("Instagram integration not found");
    }

    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      row.workspaceId,
    );

    if (isInstagramIntegrationConnected(row)) {
      await this.facebookOAuth.deactivateIntegrationForOwner(ownerId, id);
      const refreshed = await this.instagramIntegrationRepo.findOne({
        where: { id },
      });
      if (!refreshed) {
        return;
      }
      try {
        await this.instagramIntegrationRepo.remove(refreshed);
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err as QueryFailedError & { driverError?: { code?: string } })
            .driverError?.code === "23503"
        ) {
          throw new ConflictException(
            "Cannot delete Instagram integration while products or source references still reference it",
          );
        }
        throw err;
      }
      return;
    }

    try {
      await this.instagramIntegrationRepo.remove(row);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === "23503"
      ) {
        throw new ConflictException(
          "Cannot delete Instagram integration while products or source references still reference it",
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
      ...(mapped.connectedAt ? { connectedAt: mapped.connectedAt } : {}),
      ...(mapped.status !== TelegramIntegrationStatus.ACTIVE
        ? { status: mapped.status }
        : {}),
    };
  }

  private mapInstagramRow(row: InstagramIntegration): IntegrationListItemDto {
    const name =
      row.facebookPageName?.trim() ||
      row.name?.trim() ||
      `Instagram #${row.id}`;
    const connected = isInstagramIntegrationConnected(row);
    const connectedAt = row.tokenConnectedAt;
    return {
      type: "instagram",
      name,
      id: row.id,
      ...(connected && connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
        : {}),
      ...(!connected
        ? { status: INSTAGRAM_TOKEN_STATUS_DISCONNECTED }
        : {}),
    };
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

  private async findOrCreateInstagramIntegration(
    workspace: { id: number; ownerId: number; name: string },
  ): Promise<InstagramIntegration> {
    const existing = await this.instagramIntegrationRepo.findOne({
      where: { workspaceId: workspace.id, ownerId: workspace.ownerId },
      order: { id: "DESC" },
    });
    if (existing) {
      return existing;
    }

    return this.instagramIntegrationRepo.save(
      this.instagramIntegrationRepo.create({
        name: workspace.name,
        pageId: "pending",
        userAccessToken: null,
        accessToken: null,
        instagramAccountId: null,
        ownerId: workspace.ownerId,
        workspaceId: workspace.id,
      }),
    );
  }
}
