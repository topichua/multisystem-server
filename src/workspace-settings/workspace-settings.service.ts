import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InventoryMode, VariantStock, Workspace } from "../database/entities";
import { resetAdvancedStockOnModeSwitch } from "../inventory/stock.logic";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import type { WorkspaceSettingsResponseDto } from "./dto/workspace-settings-response.dto";

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(VariantStock)
    private readonly stockRepo: Repository<VariantStock>,
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
    const previousMode = ws.inventoryMode ?? InventoryMode.simple;

    if (dto.currency !== undefined) {
      const code = dto.currency.slice(0, 8);
      if (!code) {
        throw new BadRequestException("currency must not be empty");
      }
      ws.defaultCurrency = code;
    }

    if (dto.inventoryMode !== undefined) {
      ws.inventoryMode = dto.inventoryMode;
      if (
        previousMode === InventoryMode.simple &&
        dto.inventoryMode === InventoryMode.advanced
      ) {
        await this.resetStocksForAdvancedSwitch(ws.id);
      }
    }

    await this.workspaceRepo.save(ws);
    return this.toDto(ws);
  }

  async getDefaultCurrencyForOwner(ownerId: number): Promise<string> {
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return (ws.defaultCurrency?.trim() || "UAH").slice(0, 8);
  }

  async getInventoryModeForWorkspace(workspaceId: number): Promise<InventoryMode> {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    return ws?.inventoryMode ?? InventoryMode.simple;
  }

  private async resetStocksForAdvancedSwitch(workspaceId: number): Promise<void> {
    const rows = await this.stockRepo.find({ where: { workspaceId } });
    for (const row of rows) {
      const after = resetAdvancedStockOnModeSwitch({
        quantity: row.quantity,
        avgPurchasePrice: row.avgPurchasePrice,
        totalCost: row.totalCost,
        stockInitialized: row.stockInitialized,
      });
      row.avgPurchasePrice = after.avgPurchasePrice;
      row.totalCost = after.totalCost;
      row.stockInitialized = after.stockInitialized;
    }
    if (rows.length > 0) {
      await this.stockRepo.save(rows);
    }
  }

  private toDto(ws: Workspace): WorkspaceSettingsResponseDto {
    return {
      workspaceId: ws.id,
      currency: (ws.defaultCurrency?.trim() || "UAH").slice(0, 8),
      inventoryMode: ws.inventoryMode ?? InventoryMode.simple,
    };
  }
}
