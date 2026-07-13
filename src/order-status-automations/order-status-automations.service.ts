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
  OrderStatusAutomationCondition,
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
import type { OrderStatusAutomationCriteriaResponseDto } from "./dto/order-status-automation-criteria-response.dto";
import { formatAutomationDuration } from "./logic/automation-duration.logic";
import { buildAutomationRuleCriteria } from "./logic/automation-criteria.logic";
import {
  buildConditionSignature,
  normalizeAutomationConditions,
  type NormalizedAutomationCondition,
} from "./logic/automation-conditions.logic";

@Injectable()
export class OrderStatusAutomationsService {
  constructor(
    @InjectRepository(OrderStatusAutomation)
    private readonly automationRepo: Repository<OrderStatusAutomation>,
    @InjectRepository(OrderStatusAutomationCondition)
    private readonly conditionRepo: Repository<OrderStatusAutomationCondition>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
  ) {}

  async getCriteriaForUser(
    userId: number,
    appRole?: string,
  ): Promise<OrderStatusAutomationCriteriaResponseDto> {
    await this.requireView(userId, appRole);
    return buildAutomationRuleCriteria();
  }

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
      .leftJoinAndSelect("a.conditions", "conditions")
      .where("a.workspace_id = :workspaceId", { workspaceId: workspace.id })
      .andWhere("a.deleted_at IS NULL");

    if (query.isActive != null) {
      qb.andWhere("a.is_active = :isActive", { isActive: query.isActive });
    }
    if (query.sourceType != null) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM order_status_automation_conditions c
          WHERE c.automation_id = a.id
            AND c.source_type = :sourceType
        )`,
        { sourceType: query.sourceType },
      );
    }

    qb.orderBy("a.created_at", "DESC")
      .addOrderBy("a.id", "DESC")
      .addOrderBy("conditions.sort_order", "ASC")
      .addOrderBy("conditions.id", "ASC");

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
    const conditions = normalizeAutomationConditions(dto.conditions);
    this.validateActionType(dto.actionType);
    await this.assertTargetStatus(workspace.id, dto.targetOrderStatusId);
    await this.assertNoDuplicate({
      workspaceId: workspace.id,
      conditions,
      targetOrderStatusId: dto.targetOrderStatusId,
    });

    const saved = await this.automationRepo.save(
      this.automationRepo.create({
        workspaceId: workspace.id,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
        actionType: AutomationActionType.change_order_status,
        targetOrderStatusId: dto.targetOrderStatusId,
        origin: AutomationOrigin.user,
        createdById: userId,
        updatedById: userId,
        conditions: this.buildConditionEntities(conditions),
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

    const nextConditions =
      dto.conditions != null
        ? normalizeAutomationConditions(dto.conditions)
        : this.normalizePersistedConditions(row.conditions ?? []);
    const nextTargetStatusId =
      dto.targetOrderStatusId ?? row.targetOrderStatusId;

    if (dto.actionType != null) {
      this.validateActionType(dto.actionType);
    }
    if (dto.targetOrderStatusId != null) {
      await this.assertTargetStatus(workspace.id, dto.targetOrderStatusId);
    }

    await this.assertNoDuplicate(
      {
        workspaceId: workspace.id,
        conditions: nextConditions,
        targetOrderStatusId: nextTargetStatusId,
      },
      row.id,
    );

    if (dto.name != null) row.name = dto.name.trim();
    if (dto.isActive != null) row.isActive = dto.isActive;
    if (dto.targetOrderStatusId != null) {
      row.targetOrderStatusId = dto.targetOrderStatusId;
    }
    row.updatedById = userId;

    if (dto.conditions != null) {
      await this.conditionRepo.delete({ automationId: row.id });
      row.conditions = this.buildConditionEntities(nextConditions);
    }

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
      relations: { targetOrderStatus: true, conditions: true },
    });
    if (!row) {
      throw new NotFoundException("Automation not found");
    }
    return row;
  }

  private buildConditionEntities(
    conditions: NormalizedAutomationCondition[],
  ): OrderStatusAutomationCondition[] {
    return conditions.map((condition, index) =>
      this.conditionRepo.create({
        sourceType: condition.sourceType,
        sourceStatus: condition.sourceStatus,
        durationValue: condition.durationValue,
        durationUnit: condition.durationUnit,
        sortOrder: index,
      }),
    );
  }

  private normalizePersistedConditions(
    conditions: OrderStatusAutomationCondition[],
  ): NormalizedAutomationCondition[] {
    return [...conditions]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((condition) => ({
        sourceType: condition.sourceType,
        sourceStatus: condition.sourceStatus,
        durationValue: condition.durationValue,
        durationUnit: condition.durationUnit,
      }));
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
      conditions: NormalizedAutomationCondition[];
      targetOrderStatusId: number;
    },
    excludeId?: number,
  ): Promise<void> {
    const signature = buildConditionSignature(input.conditions);
    const activeRows = await this.automationRepo.find({
      where: {
        workspaceId: input.workspaceId,
        isActive: true,
        deletedAt: IsNull(),
        targetOrderStatusId: input.targetOrderStatusId,
      },
      relations: { conditions: true },
    });

    for (const row of activeRows) {
      if (excludeId != null && row.id === excludeId) {
        continue;
      }
      const rowSignature = buildConditionSignature(
        this.normalizePersistedConditions(row.conditions ?? []),
      );
      if (rowSignature === signature) {
        throw new ConflictException(
          "An active automation with the same OR conditions already exists",
        );
      }
    }
  }

  private toResponse(
    row: OrderStatusAutomation,
  ): OrderStatusAutomationResponseDto {
    const target = row.targetOrderStatus;
    if (!target) {
      throw new NotFoundException("Target order status not found");
    }
    const conditions = [...(row.conditions ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    );
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      isActive: row.isActive,
      conditions: conditions.map((condition) => ({
        id: condition.id,
        sourceType: condition.sourceType,
        sourceStatus: condition.sourceStatus,
        durationValue: condition.durationValue,
        durationUnit: condition.durationUnit,
        durationLabel: formatAutomationDuration(
          condition.durationValue,
          condition.durationUnit,
        ),
        sortOrder: condition.sortOrder,
      })),
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
