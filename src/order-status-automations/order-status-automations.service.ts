import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  AutomationActionType,
  AutomationOrigin,
  AutomationSourceType,
  OrderStatus,
  OrderStatusAutomation,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { hasBooleanPermission } from "../workspace-access/permissions";
import type {
  CreateOrderStatusAutomationDto,
  ListOrderStatusAutomationsQueryDto,
  UpdateOrderStatusAutomationDto,
} from "./dto/order-status-automation.dto";
import type { OrderStatusAutomationResponseDto } from "./dto/order-status-automation-response.dto";
import { formatAutomationDuration } from "./logic/automation-duration.logic";
import {
  isValidAutomationSourceStatus,
  normalizeAutomationSourceStatus,
} from "./logic/automation-source-status.logic";

@Injectable()
export class OrderStatusAutomationsService {
  constructor(
    @InjectRepository(OrderStatusAutomation)
    private readonly automationRepo: Repository<OrderStatusAutomation>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
  ) {}

  async listForUser(
    userId: number,
    query: ListOrderStatusAutomationsQueryDto,
    appRole?: string,
  ) {
    await this.requireView(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const qb = this.automationRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.targetOrderStatus", "target")
      .where("a.workspace_id = :workspaceId", { workspaceId: workspace.id })
      .andWhere("a.deleted_at IS NULL");

    if (query.isActive != null) {
      qb.andWhere("a.is_active = :isActive", { isActive: query.isActive });
    }
    if (query.sourceType != null) {
      qb.andWhere("a.source_type = :sourceType", {
        sourceType: query.sourceType,
      });
    }

    qb.orderBy("a.created_at", "DESC").addOrderBy("a.id", "DESC");

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: rows.map((row) => this.toResponse(row)),
      total,
      page,
      pageSize,
    };
  }

  async getByIdForUser(
    userId: number,
    automationId: number,
    appRole?: string,
  ): Promise<OrderStatusAutomationResponseDto> {
    await this.requireView(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const row = await this.findAutomationOrThrow(automationId, workspace.id);
    return this.toResponse(row);
  }

  async createForUser(
    userId: number,
    dto: CreateOrderStatusAutomationDto,
    appRole?: string,
  ): Promise<OrderStatusAutomationResponseDto> {
    await this.requireManage(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    this.validateDurationPair(
      dto.durationValue ?? null,
      dto.durationUnit ?? null,
    );
    this.validateActionType(dto.actionType);
    const sourceStatus = normalizeAutomationSourceStatus(dto.sourceStatus);
    if (!isValidAutomationSourceStatus(dto.sourceType, sourceStatus)) {
      throw new BadRequestException("Invalid sourceStatus for sourceType");
    }
    await this.assertTargetStatus(workspace.id, dto.targetOrderStatusId);
    await this.assertNoDuplicate({
      workspaceId: workspace.id,
      sourceType: dto.sourceType,
      sourceStatus,
      durationValue: dto.durationValue ?? null,
      durationUnit: dto.durationUnit ?? null,
      targetOrderStatusId: dto.targetOrderStatusId,
    });

    const saved = await this.automationRepo.save(
      this.automationRepo.create({
        workspaceId: workspace.id,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
        sourceType: dto.sourceType,
        sourceStatus,
        durationValue: dto.durationValue ?? null,
        durationUnit: dto.durationUnit ?? null,
        actionType: AutomationActionType.change_order_status,
        targetOrderStatusId: dto.targetOrderStatusId,
        origin: AutomationOrigin.user,
        createdById: userId,
        updatedById: userId,
      }),
    );
    return this.toResponse(
      await this.findAutomationOrThrow(saved.id, workspace.id),
    );
  }

  async updateForUser(
    userId: number,
    automationId: number,
    dto: UpdateOrderStatusAutomationDto,
    appRole?: string,
  ): Promise<OrderStatusAutomationResponseDto> {
    await this.requireManage(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const row = await this.findAutomationOrThrow(automationId, workspace.id);

    const nextSourceType = dto.sourceType ?? row.sourceType;
    const nextSourceStatus = normalizeAutomationSourceStatus(
      dto.sourceStatus ?? row.sourceStatus,
    );
    const nextDurationValue =
      dto.durationValue !== undefined ? dto.durationValue : row.durationValue;
    const nextDurationUnit =
      dto.durationUnit !== undefined ? dto.durationUnit : row.durationUnit;
    const nextTargetStatusId =
      dto.targetOrderStatusId ?? row.targetOrderStatusId;

    this.validateDurationPair(nextDurationValue, nextDurationUnit);
    if (dto.actionType != null) {
      this.validateActionType(dto.actionType);
    }
    if (
      dto.sourceType != null ||
      dto.sourceStatus != null ||
      !isValidAutomationSourceStatus(nextSourceType, nextSourceStatus)
    ) {
      if (!isValidAutomationSourceStatus(nextSourceType, nextSourceStatus)) {
        throw new BadRequestException("Invalid sourceStatus for sourceType");
      }
    }
    if (dto.targetOrderStatusId != null) {
      await this.assertTargetStatus(workspace.id, dto.targetOrderStatusId);
    }

    await this.assertNoDuplicate(
      {
        workspaceId: workspace.id,
        sourceType: nextSourceType,
        sourceStatus: nextSourceStatus,
        durationValue: nextDurationValue,
        durationUnit: nextDurationUnit,
        targetOrderStatusId: nextTargetStatusId,
      },
      row.id,
    );

    if (dto.name != null) row.name = dto.name.trim();
    if (dto.isActive != null) row.isActive = dto.isActive;
    if (dto.sourceType != null) row.sourceType = dto.sourceType;
    if (dto.sourceStatus != null) row.sourceStatus = nextSourceStatus;
    if (dto.durationValue !== undefined) row.durationValue = dto.durationValue;
    if (dto.durationUnit !== undefined) row.durationUnit = dto.durationUnit;
    if (dto.targetOrderStatusId != null) {
      row.targetOrderStatusId = dto.targetOrderStatusId;
    }
    row.updatedById = userId;

    await this.automationRepo.save(row);
    return this.toResponse(
      await this.findAutomationOrThrow(row.id, workspace.id),
    );
  }

  async setActiveForUser(
    userId: number,
    automationId: number,
    isActive: boolean,
    appRole?: string,
  ): Promise<OrderStatusAutomationResponseDto> {
    return this.updateForUser(userId, automationId, { isActive }, appRole);
  }

  async deleteForUser(
    userId: number,
    automationId: number,
    appRole?: string,
  ): Promise<void> {
    await this.requireManage(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const row = await this.findAutomationOrThrow(automationId, workspace.id);
    await this.automationRepo.softRemove(row);
  }

  async countActiveByTargetStatusId(
    workspaceId: number,
    targetOrderStatusId: number,
  ): Promise<number> {
    return this.automationRepo.count({
      where: {
        workspaceId,
        targetOrderStatusId,
        isActive: true,
        deletedAt: IsNull(),
      },
    });
  }

  private async findAutomationOrThrow(
    automationId: number,
    workspaceId: number,
  ): Promise<OrderStatusAutomation> {
    const row = await this.automationRepo.findOne({
      where: { id: automationId, workspaceId, deletedAt: IsNull() },
      relations: { targetOrderStatus: true },
    });
    if (!row) {
      throw new NotFoundException("Automation not found");
    }
    return row;
  }

  private async assertTargetStatus(
    workspaceId: number,
    targetOrderStatusId: number,
  ): Promise<void> {
    const status = await this.orderStatusRepo.findOne({
      where: { id: targetOrderStatusId, workspaceId },
    });
    if (!status) {
      throw new BadRequestException(
        "Target order status not found in workspace",
      );
    }
  }

  private validateDurationPair(
    durationValue: number | null,
    durationUnit:
      | import("../database/entities/automation-duration-unit.enum").AutomationDurationUnit
      | null,
  ): void {
    const hasValue = durationValue != null;
    const hasUnit = durationUnit != null;
    if (hasValue !== hasUnit) {
      throw new BadRequestException(
        "durationValue and durationUnit must be provided together or both omitted",
      );
    }
    if (durationValue != null && durationValue <= 0) {
      throw new BadRequestException("durationValue must be greater than zero");
    }
  }

  private validateActionType(actionType: AutomationActionType): void {
    if (actionType !== AutomationActionType.change_order_status) {
      throw new BadRequestException(
        "Only CHANGE_ORDER_STATUS action is supported in v1",
      );
    }
  }

  private async assertNoDuplicate(
    input: {
      workspaceId: number;
      sourceType: AutomationSourceType;
      sourceStatus: string;
      durationValue: number | null;
      durationUnit:
        | import("../database/entities/automation-duration-unit.enum").AutomationDurationUnit
        | null;
      targetOrderStatusId: number;
    },
    excludeId?: number,
  ): Promise<void> {
    const qb = this.automationRepo
      .createQueryBuilder("a")
      .where("a.workspace_id = :workspaceId", {
        workspaceId: input.workspaceId,
      })
      .andWhere("a.is_active = true")
      .andWhere("a.deleted_at IS NULL")
      .andWhere("a.source_type = :sourceType", {
        sourceType: input.sourceType,
      })
      .andWhere("a.source_status = :sourceStatus", {
        sourceStatus: input.sourceStatus,
      })
      .andWhere("a.target_order_status_id = :targetOrderStatusId", {
        targetOrderStatusId: input.targetOrderStatusId,
      });

    if (input.durationValue == null) {
      qb.andWhere("a.duration_value IS NULL");
    } else {
      qb.andWhere("a.duration_value = :durationValue", {
        durationValue: input.durationValue,
      });
      qb.andWhere("a.duration_unit = :durationUnit", {
        durationUnit: input.durationUnit,
      });
    }

    if (excludeId != null) {
      qb.andWhere("a.id != :excludeId", { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        "An active automation with the same conditions already exists",
      );
    }
  }

  private toResponse(
    row: OrderStatusAutomation,
  ): OrderStatusAutomationResponseDto {
    const target = row.targetOrderStatus;
    if (!target) {
      throw new NotFoundException("Target order status not found");
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      isActive: row.isActive,
      sourceType: row.sourceType,
      sourceStatus: row.sourceStatus,
      durationValue: row.durationValue,
      durationUnit: row.durationUnit,
      durationLabel: formatAutomationDuration(
        row.durationValue,
        row.durationUnit,
      ),
      actionType: row.actionType,
      targetOrderStatusId: row.targetOrderStatusId,
      targetOrderStatus: {
        id: target.id,
        name: target.name,
        category: target.category,
        color: target.color ?? "",
      },
      origin: row.origin,
      templateKey: row.templateKey,
      version: row.version,
      createdById: row.createdById,
      updatedById: row.updatedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async requireView(userId: number, appRole?: string): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "orders.automations.view")) {
      throw new ForbiddenException(
        "Missing orders.automations.view permission",
      );
    }
  }

  private async requireManage(userId: number, appRole?: string): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "orders.automations.manage")) {
      throw new ForbiddenException(
        "Missing orders.automations.manage permission",
      );
    }
  }
}
