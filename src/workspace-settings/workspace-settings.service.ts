import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InventoryMode, Workspace } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import type { WorkspaceSettingsResponseDto } from "./dto/workspace-settings-response.dto";

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async getForOwner(ownerId: number): Promise<WorkspaceSettingsResponseDto> {
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return this.toDto(ws);
  }

  async updateForOwner(
    ownerId: number,
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettingsResponseDto> {
    if (dto.currency === undefined && dto.inventoryMode === undefined) {
      throw new BadRequestException(
        "At least one of currency or inventoryMode (inventory_mode) must be provided",
      );
    }
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    if (dto.currency !== undefined) {
      const code = dto.currency.slice(0, 8);
      if (!code) {
        throw new BadRequestException("currency must not be empty");
      }
      ws.defaultCurrency = code;
    }
    if (dto.inventoryMode !== undefined) {
      ws.inventoryMode = dto.inventoryMode;
    }
    await this.workspaceRepo.save(ws);
    return this.toDto(ws);
  }

  /** Default product/catalog currency when the client omits `currency`. */
  async getDefaultCurrencyForOwner(ownerId: number): Promise<string> {
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return (ws.defaultCurrency?.trim() || "UAH").slice(0, 8);
  }

  async getInventoryModeForWorkspace(workspaceId: number): Promise<InventoryMode> {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    return ws?.inventoryMode ?? InventoryMode.off;
  }

  async getInventoryModeForOwner(ownerId: number): Promise<InventoryMode> {
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return ws.inventoryMode ?? InventoryMode.off;
  }

  private toDto(ws: Workspace): WorkspaceSettingsResponseDto {
    return {
      workspaceId: ws.id,
      currency: (ws.defaultCurrency?.trim() || "UAH").slice(0, 8),
      inventoryMode: ws.inventoryMode ?? InventoryMode.off,
    };
  }
}
