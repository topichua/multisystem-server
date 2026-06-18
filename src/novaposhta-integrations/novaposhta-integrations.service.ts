import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NovaPoshtaIntegration } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import type { ConnectNovaPoshtaIntegrationRequestDto } from "./dto/connect-novaposhta-integration.dto";
import type { NovaPoshtaIntegrationResponseDto } from "./dto/connect-novaposhta-integration.dto";
import type { NovaPoshtaIntegrationDetailsResponseDto } from "./dto/novaposhta-integration-details.dto";
import type { IntegrationListItemDto } from "../integrations/dto/http/integration-list-item.dto";

@Injectable()
export class NovaPoshtaIntegrationsService {
  constructor(
    @InjectRepository(NovaPoshtaIntegration)
    private readonly repo: Repository<NovaPoshtaIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly novaPoshtaApi: NovaPoshtaApiService,
  ) {}

  async connectForOwner(
    ownerId: number,
    dto: ConnectNovaPoshtaIntegrationRequestDto,
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const apiKey = dto.api_key.trim();
    const name = dto.name?.trim() || "Nova Poshta";
    const now = new Date();

    let row = await this.repo.findOne({
      where: { workspaceId: workspace.id },
    });
    if (row) {
      row.apiKey = apiKey;
      row.name = name;
      row.connectedAt = now;
      row.ownerId = ownerId;
    } else {
      row = this.repo.create({
        workspaceId: workspace.id,
        ownerId,
        name,
        apiKey,
        connectedAt: now,
      });
    }

    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async getForOwner(ownerId: number): Promise<NovaPoshtaIntegrationResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.repo.findOne({
      where: { workspaceId: workspace.id },
    });
    if (!row) {
      throw new NotFoundException("Nova Poshta integration not found");
    }
    return this.toDto(row);
  }

  async getByIdForOwner(
    ownerId: number,
    id: number,
  ): Promise<NovaPoshtaIntegrationDetailsResponseDto> {
    const row = await this.requireOwnedIntegration(ownerId, id);
    const novaposhta = await this.novaPoshtaApi.getAccountInfo(row.apiKey);
    return this.toDetailsDto(row, novaposhta);
  }

  async deleteForOwner(ownerId: number, id: number): Promise<void> {
    const row = await this.requireOwnedIntegration(ownerId, id);
    await this.repo.remove(row);
  }

  async findByWorkspace(
    workspaceId: number,
  ): Promise<NovaPoshtaIntegration | null> {
    return this.repo.findOne({ where: { workspaceId } });
  }

  mapToIntegrationListItem(row: NovaPoshtaIntegration): IntegrationListItemDto {
    return {
      type: "novaposhta",
      id: row.id,
      name: row.name,
      connectedAt: row.connectedAt.toISOString(),
    };
  }

  private async requireOwnedIntegration(
    ownerId: number,
    id: number,
  ): Promise<NovaPoshtaIntegration> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("Nova Poshta integration not found");
    }
    await this.workspaceContext.requireWorkspaceOwner(ownerId, row.workspaceId);
    return row;
  }

  private toDetailsDto(
    row: NovaPoshtaIntegration,
    novaposhta: NovaPoshtaIntegrationDetailsResponseDto["novaposhta"],
  ): NovaPoshtaIntegrationDetailsResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      ownerId: row.ownerId,
      name: row.name,
      apiKeyMasked: this.maskApiKey(row.apiKey),
      connectedAt: row.connectedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      novaposhta,
    };
  }

  private maskApiKey(apiKey: string): string {
    const trimmed = apiKey.trim();
    if (trimmed.length <= 4) {
      return "****";
    }
    return `****${trimmed.slice(-4)}`;
  }

  private toDto(row: NovaPoshtaIntegration): NovaPoshtaIntegrationResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      connectedAt: row.connectedAt.toISOString(),
      apiKeyConfigured: true,
    };
  }
}
