import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, IsNull, QueryFailedError, Repository } from "typeorm";
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
    const existing = await this.instagramIntegrationRepo.findOne({
      where: {
        workspaceId: workspace.id,
        ownerId: workspace.ownerId,
        accessToken: Not(IsNull()),
      },
      order: { id: "DESC" },
    });
    const url = await this.facebookOAuth.buildAuthorizeUrlForOwnerId(
      ownerId,
      workspace.id,
    );

    if (existing) {
      const name =
        existing.facebookPageName?.trim() ||
        existing.name?.trim() ||
        `Instagram #${existing.id}`;
      const connectedAt = existing.tokenConnectedAt;
      return {
        type: "instagram",
        id: existing.id,
        name,
        url,
        ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
          ? { connectedAt: connectedAt.toISOString() }
          : {}),
      };
    }

    return {
      type: "instagram",
      name: workspace.name,
      url,
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
      where: { workspaceId, accessToken: Not(IsNull()) },
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
  ): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    const integrationType = this.parseIntegrationType(type);

    switch (integrationType) {
      case "instagram":
        await this.deleteInstagramForOwner(ownerId, id);
        return;
      case "telegram":
        await this.telegramIntegrations.deleteForOwner(ownerId, id);
        return;
    }
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

    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      row.workspaceId,
    );

    await this.facebookOAuth.revokeIntegrationPermissionsBestEffort(row);

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
    const connectedAt = row.tokenConnectedAt;
    return {
      type: "instagram",
      name,
      id: row.id,
      ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
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
}
