import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NovaPoshtaIntegration } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import type { ConnectNovaPoshtaIntegrationRequestDto } from "./dto/connect-novaposhta-integration.dto";
import type { NovaPoshtaIntegrationResponseDto } from "./dto/connect-novaposhta-integration.dto";
import type { NovaPoshtaIntegrationDetailsResponseDto } from "./dto/novaposhta-integration-details.dto";
import type { NovaPoshtaSenderSettingsDto } from "./dto/novaposhta-sender-settings.dto";
import type { UpdateNovaPoshtaIntegrationRequestDto } from "./dto/update-novaposhta-integration.dto";
import type { DiscoverNovaPoshtaSendersResponseDto } from "./dto/discover-novaposhta-senders.dto";
import type { IntegrationListItemDto } from "../integrations/dto/http/integration-list-item.dto";
import type { NovaPoshtaCredentialsQueryDto } from "./dto/novaposhta-credentials-query.dto";

@Injectable()
export class NovaPoshtaIntegrationsService {
  constructor(
    @InjectRepository(NovaPoshtaIntegration)
    private readonly repo: Repository<NovaPoshtaIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly novaPoshtaApi: NovaPoshtaApiService,
  ) {}

  async discoverSendersForOwner(
    ownerId: number,
    credentials: NovaPoshtaCredentialsQueryDto,
  ): Promise<DiscoverNovaPoshtaSendersResponseDto> {
    const apiKey = await this.resolveSearchApiKeyForOwner(ownerId, credentials);
    return this.discoverSendersByApiKey(apiKey);
  }

  async discoverSendersByApiKey(
    apiKey: string,
  ): Promise<DiscoverNovaPoshtaSendersResponseDto> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new BadRequestException("api_key is required");
    }
    const account = await this.novaPoshtaApi.getAccountInfo(trimmed);
    return { senders: account.senders };
  }

  async searchSettlementsByApiKey(apiKey: string, query: string) {
    return this.novaPoshtaApi.searchSettlements(this.normalizeApiKey(apiKey), query);
  }

  async searchWarehousesByApiKey(
    apiKey: string,
    cityRef: string,
    query?: string,
    type: "all" | "warehouse" | "postomat" = "all",
  ) {
    return this.novaPoshtaApi.searchWarehouses(
      this.normalizeApiKey(apiKey),
      cityRef,
      query,
      type,
    );
  }

  async searchStreetsByApiKey(
    apiKey: string,
    settlementRef: string,
    query: string,
  ) {
    return this.novaPoshtaApi.searchStreets(
      this.normalizeApiKey(apiKey),
      settlementRef,
      query,
    );
  }

  async resolveSearchApiKeyForOwner(
    ownerId: number,
    credentials: NovaPoshtaCredentialsQueryDto,
  ): Promise<string> {
    const hasApiKey = !!credentials.api_key?.trim();
    const hasIntegrationId =
      credentials.nova_poshta_integration_id != null &&
      Number.isInteger(credentials.nova_poshta_integration_id) &&
      credentials.nova_poshta_integration_id > 0;

    if (hasApiKey === hasIntegrationId) {
      throw new BadRequestException(
        "Provide exactly one of api_key or nova_poshta_integration_id",
      );
    }

    if (hasIntegrationId) {
      const row = await this.requireOwnedIntegration(
        ownerId,
        credentials.nova_poshta_integration_id!,
      );
      return this.normalizeApiKey(row.apiKey);
    }

    return this.normalizeApiKey(credentials.api_key ?? "");
  }

  async connectForOwner(
    ownerId: number,
    dto: ConnectNovaPoshtaIntegrationRequestDto,
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const apiKey = dto.api_key.trim();
    const name = dto.name?.trim() || "Nova Poshta";
    const now = new Date();

    await this.novaPoshtaApi.validateConnectRequest(apiKey, {
      sender_city_ref: dto.sender_city_ref,
      sender_warehouse_ref: dto.sender_warehouse_ref,
      sender_type: dto.sender_type,
    });

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

    this.applySenderSettings(row, dto);
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async updateForOwner(
    ownerId: number,
    id: number,
    dto: UpdateNovaPoshtaIntegrationRequestDto,
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    if (
      dto.api_key === undefined &&
      dto.name === undefined &&
      !this.hasSenderSettings(dto)
    ) {
      throw new BadRequestException(
        "At least one field is required to update the integration",
      );
    }

    const row = await this.requireOwnedIntegration(ownerId, id);
    if (dto.api_key !== undefined) {
      row.apiKey = dto.api_key.trim();
      row.connectedAt = new Date();
    }
    if (dto.name !== undefined) {
      const name = dto.name?.trim();
      if (!name) {
        throw new BadRequestException("name must not be empty");
      }
      row.name = name;
    }
    this.applySenderSettings(row, dto);
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

  private hasSenderSettings(dto: NovaPoshtaSenderSettingsDto): boolean {
    return (
      dto.sender_name !== undefined ||
      dto.sender_phone !== undefined ||
      dto.sender_city_ref !== undefined ||
      dto.sender_city_name !== undefined ||
      dto.sender_type !== undefined ||
      dto.sender_warehouse_ref !== undefined ||
      dto.sender_warehouse_name !== undefined ||
      dto.sender_street_ref !== undefined ||
      dto.sender_street_name !== undefined ||
      dto.sender_building !== undefined ||
      dto.sender_flat !== undefined ||
      dto.sender_ref !== undefined ||
      dto.sender_contact_ref !== undefined ||
      dto.payment_method !== undefined ||
      dto.payer_type !== undefined
    );
  }

  private normalizeApiKey(apiKey: string): string {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new BadRequestException("api_key is required");
    }
    return trimmed;
  }

  private applySenderSettings(
    row: NovaPoshtaIntegration,
    dto: NovaPoshtaSenderSettingsDto,
  ): void {
    if (dto.sender_name !== undefined) {
      row.senderName = this.trimOrNull(dto.sender_name);
    }
    if (dto.sender_phone !== undefined) {
      row.senderPhone = this.trimOrNull(dto.sender_phone);
    }
    if (dto.sender_city_ref !== undefined) {
      row.senderCityRef = this.trimOrNull(dto.sender_city_ref);
    }
    if (dto.sender_city_name !== undefined) {
      row.senderCityName = this.trimOrNull(dto.sender_city_name);
    }
    if (dto.sender_type !== undefined) {
      row.senderType = dto.sender_type;
    }
    if (dto.sender_warehouse_ref !== undefined) {
      row.senderWarehouseRef = this.trimOrNull(dto.sender_warehouse_ref);
    }
    if (dto.sender_warehouse_name !== undefined) {
      row.senderWarehouseName = this.trimOrNull(dto.sender_warehouse_name);
    }
    if (dto.sender_street_ref !== undefined) {
      row.senderStreetRef = this.trimOrNull(dto.sender_street_ref);
    }
    if (dto.sender_street_name !== undefined) {
      row.senderStreetName = this.trimOrNull(dto.sender_street_name);
    }
    if (dto.sender_building !== undefined) {
      row.senderBuilding = this.trimOrNull(dto.sender_building);
    }
    if (dto.sender_flat !== undefined) {
      row.senderFlat = this.trimOrNull(dto.sender_flat);
    }
    if (dto.sender_ref !== undefined) {
      row.senderRef = this.trimOrNull(dto.sender_ref);
    }
    if (dto.sender_contact_ref !== undefined) {
      row.senderContactRef = this.trimOrNull(dto.sender_contact_ref);
    }
    if (dto.payment_method !== undefined) {
      row.paymentMethod = dto.payment_method;
    }
    if (dto.payer_type !== undefined) {
      row.payerType = dto.payer_type;
    }
  }

  private trimOrNull(value: string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toSenderSettingsResponse(row: NovaPoshtaIntegration) {
    return {
      sender_name: row.senderName,
      sender_phone: row.senderPhone,
      sender_city_ref: row.senderCityRef,
      sender_city_name: row.senderCityName,
      sender_type: row.senderType,
      sender_warehouse_ref: row.senderWarehouseRef,
      sender_warehouse_name: row.senderWarehouseName,
      sender_street_ref: row.senderStreetRef,
      sender_street_name: row.senderStreetName,
      sender_building: row.senderBuilding,
      sender_flat: row.senderFlat,
      sender_ref: row.senderRef,
      sender_contact_ref: row.senderContactRef,
      payment_method: row.paymentMethod,
      payer_type: row.payerType,
    };
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
      ...this.toSenderSettingsResponse(row),
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      apiKeyConfigured: true,
      ...this.toSenderSettingsResponse(row),
    };
  }
}
