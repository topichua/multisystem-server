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
  AutomationConditionOperator,
  AutomationConditionType,
  AutomationDurationUnit,
  AutomationExecutionStatus,
  AutomationOrigin,
  AutomationScheduledJobStatus,
  AutomationSourceType,
  ConversationGroup,
  OrderStatus,
  OrderStatusAutomation,
  OrderStatusAutomationCondition,
  OrderStatusAutomationExecution,
  OrderStatusAutomationScheduledJob,
} from "../database/entities";
import { ConversationGroupDefaultsService } from "../conversations/conversation-group-defaults.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { OrderStatusDefaultsService } from "../orders/order-status-defaults.service";
import { hasBooleanPermission } from "../workspace-access/permissions";
import { WorkspaceTemplate } from "../workspace-templates/workspace-template.entity";
import { WorkspaceTemplateType } from "../workspace-templates/workspace-template-type.enum";
import type {
  CreateOrderStatusAutomationDto,
  ListAutomationHistoryQueryDto,
  ListAutomationScheduledQueryDto,
  ListOrderStatusAutomationsQueryDto,
  UpdateOrderStatusAutomationDto,
} from "./dto/order-status-automation.dto";
import { resolveConditionType } from "./dto/order-status-automation.dto";
import type { OrderStatusAutomationResponseDto } from "./dto/order-status-automation-response.dto";
import type { OrderStatusAutomationCriteriaResponseDto } from "./dto/order-status-automation-criteria-response.dto";
import type {
  AutomationHistoryListResponseDto,
  AutomationScheduledListResponseDto,
} from "./dto/automation-activity-response.dto";
import { formatAutomationDuration } from "./logic/automation-duration.logic";
import { buildAutomationRuleCriteria } from "./logic/automation-criteria.logic";
import {
  buildConditionSignature,
  normalizeAutomationConditions,
  type NormalizedAutomationCondition,
} from "./logic/automation-conditions.logic";
import { parseOrderStatusConditionId } from "./logic/automation-source-status.logic";
import { AutomationSendMessageService } from "./automation-send-message.service";
import { AutomationSkipReason } from "./order-status-automation.constants";

@Injectable()
export class OrderStatusAutomationsService {
  constructor(
    @InjectRepository(OrderStatusAutomation)
    private readonly automationRepo: Repository<OrderStatusAutomation>,
    @InjectRepository(OrderStatusAutomationCondition)
    private readonly conditionRepo: Repository<OrderStatusAutomationCondition>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
    @InjectRepository(ConversationGroup)
    private readonly conversationGroupRepo: Repository<ConversationGroup>,
    @InjectRepository(WorkspaceTemplate)
    private readonly templateRepo: Repository<WorkspaceTemplate>,
    @InjectRepository(OrderStatusAutomationExecution)
    private readonly executionRepo: Repository<OrderStatusAutomationExecution>,
    @InjectRepository(OrderStatusAutomationScheduledJob)
    private readonly scheduledJobRepo: Repository<OrderStatusAutomationScheduledJob>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly orderStatusDefaults: OrderStatusDefaultsService,
    private readonly conversationGroupDefaults: ConversationGroupDefaultsService,
    private readonly sendMessage: AutomationSendMessageService,
  ) {}

  async getCriteriaForUser(
    userId: number,
    appRole?: string,
  ): Promise<OrderStatusAutomationCriteriaResponseDto> {
    await this.requireView(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    await this.orderStatusDefaults.ensureSystemStatuses(workspace.id);
    await this.conversationGroupDefaults.ensureSystemGroups(workspace.id);
    const statuses = await this.orderStatusRepo.find({
      where: { workspaceId: workspace.id },
      order: { sortOrder: "ASC", id: "ASC" },
      select: { id: true, name: true },
    });
    const conversationGroups = await this.conversationGroupRepo.find({
      where: { workspaceId: workspace.id },
      order: { sortOrder: "ASC", id: "ASC" },
      select: { id: true, name: true, systemKey: true },
    });
    const orderTemplates = await this.templateRepo.find({
      where: { workspaceId: workspace.id, type: WorkspaceTemplateType.order },
      order: { id: "ASC" },
      select: { id: true, name: true },
    });

    return {
      ...buildAutomationRuleCriteria(),
      statuses: statuses.map((row) => ({
        id: row.id,
        name: row.name,
      })),
      conversationGroups: conversationGroups.map((row) => ({
        id: row.id,
        name: row.name,
        systemKey: row.systemKey,
      })),
      orderTemplates: orderTemplates.map((row) => ({
        id: row.id,
        name: row.name,
      })),
    };
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

    const qb = this.automationRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.targetOrderStatus", "target")
      .leftJoinAndSelect("a.targetConversationGroup", "targetGroup")
      .leftJoinAndSelect("a.targetTemplate", "targetTemplate")
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

    const rows = await qb.getMany();

    return {
      items: rows.map((row) => this.toResponse(row)),
      total: rows.length,
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
    const conditionType =
      resolveConditionType(dto) ?? AutomationConditionType.or;
    const actionType =
      dto.actionType ?? AutomationActionType.change_order_status;
    this.validateActionType(actionType);
    const delay = this.normalizeActionDelay(
      actionType,
      dto.actionDelayValue,
      dto.actionDelayUnit,
      dto.waitForBusinessHours,
    );
    const targets = await this.resolveAndAssertActionTargets(
      workspace.id,
      actionType,
      dto.targetOrderStatusId,
      dto.targetConversationGroupId,
      dto.targetTemplateId,
    );
    await this.assertOrderStatusConditions(
      workspace.id,
      conditions,
      targets.targetOrderStatusId,
    );
    await this.assertNoDuplicate({
      workspaceId: workspace.id,
      conditionType,
      conditions,
      actionType,
      targetOrderStatusId: targets.targetOrderStatusId,
      targetConversationGroupId: targets.targetConversationGroupId,
      targetTemplateId: targets.targetTemplateId,
    });

    const saved = await this.automationRepo.save(
      this.automationRepo.create({
        workspaceId: workspace.id,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
        conditionType,
        actionType,
        targetOrderStatusId: targets.targetOrderStatusId,
        targetConversationGroupId: targets.targetConversationGroupId,
        targetTemplateId: targets.targetTemplateId,
        actionDelayValue: delay.actionDelayValue,
        actionDelayUnit: delay.actionDelayUnit,
        waitForBusinessHours: delay.waitForBusinessHours,
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
    const nextConditionType =
      resolveConditionType(dto, row.conditionType) ?? row.conditionType;
    const nextActionType = dto.actionType ?? row.actionType;
    this.validateActionType(nextActionType);

    const nextTargetOrderStatusId =
      dto.targetOrderStatusId !== undefined
        ? dto.targetOrderStatusId
        : row.targetOrderStatusId;
    const nextTargetConversationGroupId =
      dto.targetConversationGroupId !== undefined
        ? dto.targetConversationGroupId
        : row.targetConversationGroupId;
    const nextTargetTemplateId =
      dto.targetTemplateId !== undefined
        ? dto.targetTemplateId
        : row.targetTemplateId;

    const delay = this.normalizeActionDelay(
      nextActionType,
      dto.actionDelayValue !== undefined
        ? dto.actionDelayValue
        : row.actionDelayValue,
      dto.actionDelayUnit !== undefined
        ? dto.actionDelayUnit
        : row.actionDelayUnit,
      dto.waitForBusinessHours !== undefined
        ? dto.waitForBusinessHours
        : row.waitForBusinessHours,
    );

    const targets = await this.resolveAndAssertActionTargets(
      workspace.id,
      nextActionType,
      nextTargetOrderStatusId,
      nextTargetConversationGroupId,
      nextTargetTemplateId,
    );

    await this.assertOrderStatusConditions(
      workspace.id,
      nextConditions,
      targets.targetOrderStatusId,
    );

    await this.assertNoDuplicate(
      {
        workspaceId: workspace.id,
        conditionType: nextConditionType,
        conditions: nextConditions,
        actionType: nextActionType,
        targetOrderStatusId: targets.targetOrderStatusId,
        targetConversationGroupId: targets.targetConversationGroupId,
        targetTemplateId: targets.targetTemplateId,
      },
      row.id,
    );

    const wasActive = row.isActive;
    if (dto.name != null) row.name = dto.name.trim();
    if (dto.isActive != null) row.isActive = dto.isActive;
    if (dto.conditionType != null || dto.condition_type != null) {
      row.conditionType = nextConditionType;
    }
    row.actionType = nextActionType;
    row.targetOrderStatusId = targets.targetOrderStatusId;
    row.targetConversationGroupId = targets.targetConversationGroupId;
    row.targetTemplateId = targets.targetTemplateId;
    row.actionDelayValue = delay.actionDelayValue;
    row.actionDelayUnit = delay.actionDelayUnit;
    row.waitForBusinessHours = delay.waitForBusinessHours;
    row.updatedById = userId;

    if (dto.conditions != null) {
      await this.conditionRepo.delete({ automationId: row.id });
      row.conditions = this.buildConditionEntities(nextConditions);
    }

    await this.automationRepo.save(row);

    if (wasActive && !row.isActive) {
      await this.sendMessage.cancelPendingForAutomation(
        row.id,
        AutomationSkipReason.AUTOMATION_DISABLED,
      );
    } else if (row.actionType === AutomationActionType.send_message) {
      // Drop queued jobs so edited rules don't send with stale config.
      await this.sendMessage.cancelPendingForAutomation(
        row.id,
        AutomationSkipReason.STALE_AUTOMATION_VERSION,
        { deleteJobs: true, logSkip: false },
      );
    }

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
    await this.sendMessage.cancelPendingForAutomation(
      row.id,
      AutomationSkipReason.AUTOMATION_DISABLED,
    );
    await this.automationRepo.softDelete({ id: row.id });
  }

  async listHistoryForUser(
    userId: number,
    query: ListAutomationHistoryQueryDto,
    appRole?: string,
  ): Promise<AutomationHistoryListResponseDto> {
    await this.requireView(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const qb = this.executionRepo
      .createQueryBuilder("e")
      .leftJoin(OrderStatusAutomation, "a", "a.id = e.automation_id")
      .where("e.workspace_id = :workspaceId", { workspaceId: workspace.id });

    if (query.automationId != null) {
      qb.andWhere("e.automation_id = :automationId", {
        automationId: query.automationId,
      });
    }
    if (query.orderId != null) {
      qb.andWhere("e.order_id = :orderId", { orderId: query.orderId });
    }
    if (query.status != null) {
      qb.andWhere("e.status = :status", { status: query.status });
    }

    qb.orderBy("e.executed_at", "DESC")
      .addOrderBy("e.id", "DESC")
      .skip(offset)
      .take(limit)
      .select([
        "e.id AS id",
        "e.automation_id AS \"automationId\"",
        "e.automation_name_snapshot AS \"automationName\"",
        "a.action_type AS \"actionType\"",
        "e.order_id AS \"orderId\"",
        "e.status AS status",
        "e.reason AS reason",
        "e.source_type AS \"sourceType\"",
        "e.source_status_snapshot AS \"sourceStatus\"",
        "e.target_order_status_id AS \"targetOrderStatusId\"",
        "e.target_conversation_group_id AS \"targetConversationGroupId\"",
        "e.target_template_id AS \"targetTemplateId\"",
        "e.conversation_id AS \"conversationId\"",
        "e.message_preview AS \"messagePreview\"",
        "e.error_code AS \"errorCode\"",
        "e.error_message AS \"errorMessage\"",
        "e.executed_at AS \"executedAt\"",
      ]);

    const [rows, total] = await Promise.all([
      qb.getRawMany<{
        id: number;
        automationId: number;
        automationName: string;
        actionType: AutomationActionType | null;
        orderId: number;
        status: AutomationExecutionStatus;
        reason: string | null;
        sourceType: AutomationSourceType;
        sourceStatus: string;
        targetOrderStatusId: number | null;
        targetConversationGroupId: number | null;
        targetTemplateId: number | null;
        conversationId: number | null;
        messagePreview: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        executedAt: Date;
      }>(),
      this.executionRepo
        .createQueryBuilder("e")
        .where("e.workspace_id = :workspaceId", { workspaceId: workspace.id })
        .andWhere(
          query.automationId != null
            ? "e.automation_id = :automationId"
            : "1=1",
          query.automationId != null
            ? { automationId: query.automationId }
            : {},
        )
        .andWhere(
          query.orderId != null ? "e.order_id = :orderId" : "1=1",
          query.orderId != null ? { orderId: query.orderId } : {},
        )
        .andWhere(
          query.status != null ? "e.status = :status" : "1=1",
          query.status != null ? { status: query.status } : {},
        )
        .getCount(),
    ]);

    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        automationId: Number(row.automationId),
        automationName: row.automationName,
        actionType: row.actionType,
        orderId: Number(row.orderId),
        status: row.status,
        reason: row.reason,
        sourceType: row.sourceType,
        sourceStatus: row.sourceStatus,
        targetOrderStatusId: row.targetOrderStatusId,
        targetConversationGroupId: row.targetConversationGroupId,
        targetTemplateId: row.targetTemplateId,
        conversationId: row.conversationId,
        messagePreview: row.messagePreview,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        executedAt: row.executedAt,
      })),
      total,
    };
  }

  async listScheduledForUser(
    userId: number,
    query: ListAutomationScheduledQueryDto,
    appRole?: string,
  ): Promise<AutomationScheduledListResponseDto> {
    await this.requireView(userId, appRole);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const status = query.status ?? AutomationScheduledJobStatus.pending;

    const qb = this.scheduledJobRepo
      .createQueryBuilder("j")
      .where("j.workspace_id = :workspaceId", { workspaceId: workspace.id })
      .andWhere("j.status = :status", { status });

    if (query.automationId != null) {
      qb.andWhere("j.automation_id = :automationId", {
        automationId: query.automationId,
      });
    }

    const [items, total] = await qb
      .orderBy("j.run_at", "ASC")
      .addOrderBy("j.id", "ASC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((job) => ({
        id: job.id,
        automationId: job.automationId,
        automationName: job.automationNameSnapshot,
        orderId: job.orderId,
        conversationId: job.conversationId,
        templateId: job.templateId,
        status: job.status,
        runAt: job.runAt,
        actionDelayValue: job.actionDelayValue,
        actionDelayUnit: job.actionDelayUnit,
        waitForBusinessHours: job.waitForBusinessHours,
        cancelReason: job.cancelReason,
        messagePreview: job.messagePreview,
        sentAt: job.sentAt,
        createdAt: job.createdAt,
      })),
      total,
    };
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
      relations: {
        targetOrderStatus: true,
        targetConversationGroup: true,
        targetTemplate: true,
        conditions: true,
      },
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
        operator: condition.operator,
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
        operator: condition.operator ?? AutomationConditionOperator.eq,
        durationValue: condition.durationValue,
        durationUnit: condition.durationUnit,
      }));
  }

  private async resolveAndAssertActionTargets(
    workspaceId: number,
    actionType: AutomationActionType,
    targetOrderStatusId: number | null | undefined,
    targetConversationGroupId: number | null | undefined,
    targetTemplateId: number | null | undefined,
  ): Promise<{
    targetOrderStatusId: number | null;
    targetConversationGroupId: number | null;
    targetTemplateId: number | null;
  }> {
    if (actionType === AutomationActionType.change_order_status) {
      if (targetOrderStatusId == null) {
        throw new BadRequestException(
          "targetOrderStatusId is required for CHANGE_ORDER_STATUS",
        );
      }
      await this.assertTargetStatus(workspaceId, targetOrderStatusId);
      return {
        targetOrderStatusId,
        targetConversationGroupId: null,
        targetTemplateId: null,
      };
    }

    if (actionType === AutomationActionType.change_conversation_group) {
      if (targetConversationGroupId == null) {
        throw new BadRequestException(
          "targetConversationGroupId is required for CHANGE_CONVERSATION_GROUP",
        );
      }
      await this.assertTargetConversationGroup(
        workspaceId,
        targetConversationGroupId,
      );
      return {
        targetOrderStatusId: null,
        targetConversationGroupId,
        targetTemplateId: null,
      };
    }

    if (actionType === AutomationActionType.send_message) {
      if (targetTemplateId == null) {
        throw new BadRequestException(
          "targetTemplateId is required for SEND_MESSAGE",
        );
      }
      await this.assertTargetOrderTemplate(workspaceId, targetTemplateId);
      return {
        targetOrderStatusId: null,
        targetConversationGroupId: null,
        targetTemplateId,
      };
    }

    throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }

  private normalizeActionDelay(
    actionType: AutomationActionType,
    actionDelayValue: number | null | undefined,
    actionDelayUnit: AutomationDurationUnit | null | undefined,
    waitForBusinessHours: boolean | undefined,
  ): {
    actionDelayValue: number | null;
    actionDelayUnit: AutomationDurationUnit | null;
    waitForBusinessHours: boolean;
  } {
    if (actionType !== AutomationActionType.send_message) {
      return {
        actionDelayValue: null,
        actionDelayUnit: null,
        waitForBusinessHours: false,
      };
    }

    const hasValue = actionDelayValue != null;
    const hasUnit = actionDelayUnit != null;
    if (hasValue !== hasUnit) {
      throw new BadRequestException(
        "actionDelayValue and actionDelayUnit must be provided together (or both omitted)",
      );
    }
    if (hasValue && (!Number.isInteger(actionDelayValue) || actionDelayValue! < 1)) {
      throw new BadRequestException("actionDelayValue must be a positive integer");
    }

    return {
      actionDelayValue: hasValue ? actionDelayValue! : null,
      actionDelayUnit: hasUnit ? actionDelayUnit! : null,
      waitForBusinessHours: waitForBusinessHours ?? false,
    };
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

  private async assertTargetConversationGroup(
    workspaceId: number,
    targetConversationGroupId: number,
  ): Promise<void> {
    const group = await this.conversationGroupRepo.findOne({
      where: { id: targetConversationGroupId, workspaceId },
    });
    if (!group) {
      throw new BadRequestException(
        "Target conversation group not found in workspace",
      );
    }
  }

  private async assertTargetOrderTemplate(
    workspaceId: number,
    targetTemplateId: number,
  ): Promise<void> {
    const template = await this.templateRepo.findOne({
      where: { id: targetTemplateId, workspaceId },
    });
    if (!template) {
      throw new BadRequestException(
        "Target template not found in workspace",
      );
    }
    if (template.type !== WorkspaceTemplateType.order) {
      throw new BadRequestException(
        "SEND_MESSAGE requires an order template (type=order)",
      );
    }
  }

  /**
   * ORDER_STATUS conditions must reference real workspace statuses.
   * EQ + same id as CHANGE_ORDER_STATUS target is a noop (rejected).
   */
  private async assertOrderStatusConditions(
    workspaceId: number,
    conditions: NormalizedAutomationCondition[],
    targetOrderStatusId: number | null,
  ): Promise<void> {
    for (const condition of conditions) {
      if (condition.sourceType !== AutomationSourceType.order_status) {
        continue;
      }
      const statusId = parseOrderStatusConditionId(condition.sourceStatus);
      if (statusId == null) {
        throw new BadRequestException(
          "Invalid sourceStatus for ORDER_STATUS: expected workspace order status id",
        );
      }
      const status = await this.orderStatusRepo.findOne({
        where: { id: statusId, workspaceId },
      });
      if (!status) {
        throw new BadRequestException(
          `Order status ${statusId} not found in workspace`,
        );
      }
      if (
        targetOrderStatusId != null &&
        condition.operator === AutomationConditionOperator.eq &&
        statusId === targetOrderStatusId
      ) {
        throw new BadRequestException(
          "ORDER_STATUS EQ condition cannot equal targetOrderStatusId",
        );
      }
    }
  }

  private validateActionType(actionType: AutomationActionType): void {
    if (
      actionType !== AutomationActionType.change_order_status &&
      actionType !== AutomationActionType.change_conversation_group &&
      actionType !== AutomationActionType.send_message
    ) {
      throw new BadRequestException(
        "Unsupported actionType. Allowed: CHANGE_ORDER_STATUS, CHANGE_CONVERSATION_GROUP, SEND_MESSAGE",
      );
    }
  }

  private async assertNoDuplicate(
    input: {
      workspaceId: number;
      conditionType: AutomationConditionType;
      conditions: NormalizedAutomationCondition[];
      actionType: AutomationActionType;
      targetOrderStatusId: number | null;
      targetConversationGroupId: number | null;
      targetTemplateId: number | null;
    },
    excludeId?: number,
  ): Promise<void> {
    const signature = buildConditionSignature(input.conditions);
    const qb = this.automationRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.conditions", "conditions")
      .where("a.workspace_id = :workspaceId", {
        workspaceId: input.workspaceId,
      })
      .andWhere("a.is_active = true")
      .andWhere("a.deleted_at IS NULL")
      .andWhere("a.condition_type = :conditionType", {
        conditionType: input.conditionType,
      })
      .andWhere("a.action_type = :actionType", {
        actionType: input.actionType,
      });

    if (input.actionType === AutomationActionType.change_order_status) {
      qb.andWhere("a.target_order_status_id = :targetOrderStatusId", {
        targetOrderStatusId: input.targetOrderStatusId,
      });
    } else if (
      input.actionType === AutomationActionType.change_conversation_group
    ) {
      qb.andWhere("a.target_conversation_group_id = :targetConversationGroupId", {
        targetConversationGroupId: input.targetConversationGroupId,
      });
    } else {
      qb.andWhere("a.target_template_id = :targetTemplateId", {
        targetTemplateId: input.targetTemplateId,
      });
    }

    const activeRows = await qb.getMany();

    for (const row of activeRows) {
      if (excludeId != null && row.id === excludeId) {
        continue;
      }
      const rowSignature = buildConditionSignature(
        this.normalizePersistedConditions(row.conditions ?? []),
      );
      if (rowSignature === signature) {
        throw new ConflictException(
          "An active automation with the same conditions already exists",
        );
      }
    }
  }

  private toResponse(
    row: OrderStatusAutomation,
  ): OrderStatusAutomationResponseDto {
    const conditions = [...(row.conditions ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    );

    const targetStatus = row.targetOrderStatus;
    const targetGroup = row.targetConversationGroup;
    const targetTemplate = row.targetTemplate;

    if (
      row.actionType === AutomationActionType.change_order_status &&
      !targetStatus
    ) {
      throw new NotFoundException("Target order status not found");
    }
    if (
      row.actionType === AutomationActionType.change_conversation_group &&
      !targetGroup
    ) {
      throw new NotFoundException("Target conversation group not found");
    }
    if (
      row.actionType === AutomationActionType.send_message &&
      !targetTemplate
    ) {
      throw new NotFoundException("Target template not found");
    }

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      isActive: row.isActive,
      conditionType: row.conditionType ?? AutomationConditionType.or,
      condition_type: row.conditionType ?? AutomationConditionType.or,
      conditions: conditions.map((condition) => ({
        id: condition.id,
        sourceType: condition.sourceType,
        sourceStatus: condition.sourceStatus,
        operator: condition.operator ?? AutomationConditionOperator.eq,
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
      targetOrderStatus: targetStatus
        ? {
            id: targetStatus.id,
            name: targetStatus.name,
            category: targetStatus.category,
            color: targetStatus.color ?? "",
          }
        : null,
      targetConversationGroupId: row.targetConversationGroupId,
      targetConversationGroup: targetGroup
        ? {
            id: targetGroup.id,
            name: targetGroup.name,
            systemKey: targetGroup.systemKey,
          }
        : null,
      targetTemplateId: row.targetTemplateId,
      targetTemplate: targetTemplate
        ? {
            id: targetTemplate.id,
            name: targetTemplate.name,
            type: targetTemplate.type,
          }
        : null,
      actionDelayValue: row.actionDelayValue,
      actionDelayUnit: row.actionDelayUnit,
      actionDelayLabel: formatAutomationDuration(
        row.actionDelayValue,
        row.actionDelayUnit,
      ),
      waitForBusinessHours: row.waitForBusinessHours ?? false,
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
