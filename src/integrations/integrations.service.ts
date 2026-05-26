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
  Workspace,
} from "../database/entities";
import type { TelegramIntegration } from "../database/entities";
import { TelegramIntegrationsService } from "../telegram-integrations/telegram-integrations.service";
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
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
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

    const row = await this.requireLatestInstagramIntegrationForOwner(ownerId);
    const url = await this.facebookOAuth.buildAuthorizeUrlForOwnerId(
      ownerId,
      row.workspaceId,
    );
    const name =
      row.facebookPageName?.trim() ||
      row.name?.trim() ||
      `Instagram #${row.id}`;
    const connectedAt = row.tokenConnectedAt;

    return {
      type: "instagram",
      id: row.id,
      name,
      url,
      ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
        : {}),
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

    const workspace = await this.workspaceRepo.findOne({
      where: { id: row.workspaceId, ownerId },
    });
    if (!workspace) {
      throw new NotFoundException("Instagram integration not found");
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
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }

    const anchor = await this.requireLatestInstagramIntegrationForOwner(
      ownerId,
    );

    const workspaceId = workspaceIdParam ?? anchor.workspaceId;
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace || workspace.ownerId !== ownerId) {
      throw new NotFoundException("Workspace not found for current user");
    }

    return workspaceId;
  }

  private async requireLatestInstagramIntegrationForOwner(
    ownerId: number,
  ): Promise<InstagramIntegration> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }
    const row = await this.instagramIntegrationRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!row) {
      throw new NotFoundException(
        "Integration not found for current user; create a workspace first",
      );
    }
    return row;
  }
}
