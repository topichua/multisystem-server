import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  InventoryMode,
  VariantStock,
  Workspace,
  WorkspaceLanguage,
} from "../database/entities";
import { resetAdvancedStockOnModeSwitch } from "../inventory/stock.logic";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { hasBooleanPermission } from "../workspace-access/permissions";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import type { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import type { WorkspaceSettingsResponseDto } from "./dto/workspace-settings-response.dto";
import {
  isWithinWorkSchedule,
  normalizeTimezone,
  normalizeWorkSchedule,
  resolveNextWorkScheduleSlot,
} from "./work-schedule/work-schedule.logic";
import {
  DEFAULT_WORK_SCHEDULE,
  DEFAULT_WORKSPACE_TIMEZONE,
  type WorkspaceWorkSchedule,
} from "./work-schedule/work-schedule.types";

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(VariantStock)
    private readonly stockRepo: Repository<VariantStock>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly workspacePermissions: WorkspacePermissionsService,
  ) {}

  async getForOwner(
    ownerId: number,
    appRole?: string,
  ): Promise<WorkspaceSettingsResponseDto> {
    await this.requireSettingsManagement(ownerId, appRole);
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return this.toDto(ws);
  }

  async updateForOwner(
    ownerId: number,
    dto: UpdateWorkspaceSettingsDto,
    appRole?: string,
  ): Promise<WorkspaceSettingsResponseDto> {
    await this.requireSettingsManagement(ownerId, appRole);
    if (
      dto.currency === undefined &&
      dto.inventoryMode === undefined &&
      dto.language === undefined &&
      dto.wishlistEnabled === undefined &&
      dto.timezone === undefined &&
      dto.workSchedule === undefined
    ) {
      throw new BadRequestException(
        "At least one of currency, inventoryMode, language, wishlistEnabled, timezone, or workSchedule must be provided",
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

    if (dto.language !== undefined) {
      ws.language = dto.language;
    }

    if (dto.wishlistEnabled !== undefined) {
      ws.wishlistEnabled = dto.wishlistEnabled;
    }

    if (dto.timezone !== undefined) {
      ws.timezone = normalizeTimezone(dto.timezone);
    }

    if (dto.workSchedule !== undefined) {
      const current = this.readSchedule(ws);
      ws.workSchedule = normalizeWorkSchedule({
        ...current,
        ...dto.workSchedule,
        dayHours:
          dto.workSchedule.dayHours !== undefined
            ? dto.workSchedule.dayHours
            : current.dayHours,
        workDays:
          dto.workSchedule.workDays !== undefined
            ? dto.workSchedule.workDays
            : current.workDays,
      });
    }

    await this.workspaceRepo.save(ws);
    return this.toDto(ws);
  }

  async isWishlistEnabledForWorkspace(workspaceId: number): Promise<boolean> {
    const ws = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
      select: { id: true, wishlistEnabled: true },
    });
    return ws?.wishlistEnabled ?? false;
  }

  async getDefaultCurrencyForOwner(ownerId: number): Promise<string> {
    const ws = await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return (ws.defaultCurrency?.trim() || "UAH").slice(0, 8);
  }

  async getInventoryModeForWorkspace(
    workspaceId: number,
  ): Promise<InventoryMode> {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    return ws?.inventoryMode ?? InventoryMode.simple;
  }

  /** Whether `at` falls inside the workspace work schedule. */
  async isWithinWorkScheduleForWorkspace(
    workspaceId: number,
    at: Date = new Date(),
  ): Promise<boolean> {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!ws) {
      return true;
    }
    return isWithinWorkSchedule(
      at,
      this.readSchedule(ws),
      ws.timezone || DEFAULT_WORKSPACE_TIMEZONE,
    );
  }

  /**
   * If `desiredAt` is inside working hours → same instant.
   * Else → start of the next working window (for deferred auto-messages).
   */
  async resolveSendAtForWorkspace(
    workspaceId: number,
    desiredAt: Date = new Date(),
  ): Promise<Date> {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!ws) {
      return desiredAt;
    }
    return resolveNextWorkScheduleSlot(
      desiredAt,
      this.readSchedule(ws),
      ws.timezone || DEFAULT_WORKSPACE_TIMEZONE,
    );
  }

  private readSchedule(ws: Workspace): WorkspaceWorkSchedule {
    try {
      return normalizeWorkSchedule(
        (ws.workSchedule as WorkspaceWorkSchedule | null) ??
          DEFAULT_WORK_SCHEDULE,
      );
    } catch {
      return {
        ...DEFAULT_WORK_SCHEDULE,
        workDays: [...DEFAULT_WORK_SCHEDULE.workDays],
        dayHours: {},
      };
    }
  }

  private async resetStocksForAdvancedSwitch(
    workspaceId: number,
  ): Promise<void> {
    const rows = await this.stockRepo.find({ where: { workspaceId } });
    for (const row of rows) {
      const after = resetAdvancedStockOnModeSwitch({
        quantity: row.quantity,
        reservedQuantity: row.reservedQuantity,
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

  private async requireSettingsManagement(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.workspacePermissions.getResolvedForUser(
      userId,
      appRole,
    );
    if (!hasBooleanPermission(resolved, "workspace.settings")) {
      throw new ForbiddenException("Missing workspace.settings permission");
    }
  }

  private toDto(ws: Workspace): WorkspaceSettingsResponseDto {
    const schedule = this.readSchedule(ws);
    return {
      workspaceId: ws.id,
      currency: (ws.defaultCurrency?.trim() || "UAH").slice(0, 8),
      inventoryMode: ws.inventoryMode ?? InventoryMode.simple,
      language: ws.language ?? WorkspaceLanguage.ua,
      wishlistEnabled: ws.wishlistEnabled ?? false,
      timezone: ws.timezone?.trim() || DEFAULT_WORKSPACE_TIMEZONE,
      workSchedule: schedule,
    };
  }
}
