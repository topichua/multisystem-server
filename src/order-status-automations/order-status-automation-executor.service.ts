import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, Repository } from "typeorm";
import {
  AutomationConditionOperator,
  AutomationConditionType,
  AutomationExecutionStatus,
  AutomationDurationUnit,
  AutomationSourceType,
  Order,
  OrderDeliveryInfo,
  OrderStatusAutomation,
  OrderStatusAutomationCondition,
  OrderStatusAutomationExecution,
} from "../database/entities";
import {
  isTimedCondition,
  matchesAutomationSourceStatus,
} from "./logic/automation-conditions.logic";
import {
  addDuration,
  buildIdempotencyKey,
} from "./logic/automation-duration.logic";
import { AutomationSkipReason } from "./order-status-automation.constants";
import { OrderStatusChangeSource } from "../orders/order-status-transition.service";
import { OrderStatusTransitionService } from "../orders/order-status-transition.service";

export type EvaluateImmediateRulesInput = {
  workspaceId: number;
  orderId: number;
  sourceType: AutomationSourceType;
  sourceStatus: string;
  statusChangedAt: Date;
};

export type EvaluateTimedRuleInput = {
  scheduledJobId: number;
};

@Injectable()
export class OrderStatusAutomationExecutorService {
  private readonly log = new Logger(OrderStatusAutomationExecutorService.name);

  constructor(
    @InjectRepository(OrderStatusAutomation)
    private readonly automationRepo: Repository<OrderStatusAutomation>,
    @InjectRepository(OrderStatusAutomationExecution)
    private readonly executionRepo: Repository<OrderStatusAutomationExecution>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @Inject(forwardRef(() => OrderStatusTransitionService))
    private readonly orderStatusTransition: OrderStatusTransitionService,
  ) {}

  async evaluateImmediateRules(
    input: EvaluateImmediateRulesInput,
  ): Promise<void> {
    const rules = await this.automationRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.conditions", "allConditions")
      .where("a.workspace_id = :workspaceId", {
        workspaceId: input.workspaceId,
      })
      .andWhere("a.is_active = true")
      .andWhere("a.deleted_at IS NULL")
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM order_status_automation_conditions c
          WHERE c.automation_id = a.id
            AND c.duration_value IS NULL
            AND c.duration_unit IS NULL
            AND c.source_type = :sourceType
            AND (
              (COALESCE(c.operator, 'EQ') = 'EQ' AND c.source_status = :sourceStatus)
              OR
              (c.operator = 'NEQ' AND c.source_status <> :sourceStatus)
            )
        )`,
        {
          sourceType: input.sourceType,
          sourceStatus: input.sourceStatus,
        },
      )
      .getMany();

    this.log.log(
      `Immediate automations matched=${rules.length} workspace=${input.workspaceId} order=${input.orderId} source=${input.sourceType}:${input.sourceStatus}`,
    );

    for (const rule of rules) {
      const matchingCondition = (rule.conditions ?? []).find(
        (condition) =>
          condition.sourceType === input.sourceType &&
          !isTimedCondition(condition) &&
          matchesAutomationSourceStatus(
            condition.operator ?? AutomationConditionOperator.eq,
            condition.sourceStatus,
            input.sourceStatus,
          ),
      );
      if (!matchingCondition) {
        continue;
      }

      await this.applyAutomation({
        automation: rule,
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        sourceType: matchingCondition.sourceType,
        conditionSourceStatus: matchingCondition.sourceStatus,
        operator: matchingCondition.operator ?? AutomationConditionOperator.eq,
        observedSourceStatus: input.sourceStatus,
        durationValue: matchingCondition.durationValue,
        durationUnit: matchingCondition.durationUnit,
        expectedStatusChangedAt: input.statusChangedAt,
        timed: false,
      });
    }
  }

  async evaluateDueTimedRules(input: {
    sourceType: AutomationSourceType;
    workspaceId?: number;
    limitPerRule?: number;
  }): Promise<number> {
    const rulesQb = this.automationRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.conditions", "allConditions")
      .where("a.is_active = true")
      .andWhere("a.deleted_at IS NULL")
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM order_status_automation_conditions c
          WHERE c.automation_id = a.id
            AND c.duration_value IS NOT NULL
            AND c.duration_unit IS NOT NULL
            AND c.source_type = :sourceType
        )`,
        { sourceType: input.sourceType },
      );

    if (input.workspaceId != null) {
      rulesQb.andWhere("a.workspace_id = :workspaceId", {
        workspaceId: input.workspaceId,
      });
    }

    const rules = await rulesQb.getMany();

    let evaluated = 0;
    for (const rule of rules) {
      const matchingConditions = (rule.conditions ?? []).filter(
        (condition) =>
          condition.sourceType === input.sourceType &&
          isTimedCondition(condition),
      );

      for (const condition of matchingConditions) {
        const candidates = await this.findTimedRuleCandidates(
          rule,
          condition,
          input.limitPerRule ?? 100,
        );

        for (const candidate of candidates) {
          const statusChangedAt =
            input.sourceType === AutomationSourceType.delivery_status
              ? candidate.deliveryStatusAt
              : input.sourceType === AutomationSourceType.payment_status
                ? candidate.paymentStatusAt
                : candidate.statusChangedAt;
          if (!statusChangedAt) {
            continue;
          }

          const dueAt = addDuration(
            statusChangedAt,
            condition.durationValue!,
            condition.durationUnit!,
          );
          if (dueAt.getTime() > Date.now()) {
            continue;
          }

          let observedSourceStatus: string | null;
          if (input.sourceType === AutomationSourceType.delivery_status) {
            observedSourceStatus =
              candidate.deliveryStatus ??
              (await this.resolveCurrentSourceStatus(
                candidate,
                input.sourceType,
              ));
          } else if (input.sourceType === AutomationSourceType.payment_status) {
            observedSourceStatus = candidate.paymentStatus;
          } else {
            observedSourceStatus = String(candidate.statusId);
          }

          await this.applyAutomation({
            automation: rule,
            workspaceId: candidate.workspaceId,
            orderId: candidate.id,
            sourceType: condition.sourceType,
            conditionSourceStatus: condition.sourceStatus,
            operator: condition.operator ?? AutomationConditionOperator.eq,
            observedSourceStatus: String(observedSourceStatus ?? ""),
            durationValue: condition.durationValue,
            durationUnit: condition.durationUnit,
            expectedStatusChangedAt: statusChangedAt,
            timed: true,
          });
          evaluated += 1;
        }
      }
    }

    return evaluated;
  }

  private async findTimedRuleCandidates(
    rule: OrderStatusAutomation,
    condition: OrderStatusAutomationCondition,
    limit: number,
  ): Promise<
    Array<
      Order & {
        deliveryStatusAt?: Date | null;
        deliveryStatus?: string | null;
      }
    >
  > {
    const operator = condition.operator ?? AutomationConditionOperator.eq;

    if (condition.sourceType === AutomationSourceType.payment_status) {
      if (operator === AutomationConditionOperator.neq) {
        return this.orderRepo.find({
          where: {
            workspaceId: rule.workspaceId,
            paymentStatus: Not(
              condition.sourceStatus as Order["paymentStatus"],
            ),
          },
          take: limit,
        });
      }
      return this.orderRepo.find({
        where: {
          workspaceId: rule.workspaceId,
          paymentStatus: condition.sourceStatus as Order["paymentStatus"],
        },
        take: limit,
      });
    }

    if (condition.sourceType === AutomationSourceType.order_status) {
      const statusId = Number(condition.sourceStatus);
      if (!Number.isInteger(statusId) || statusId <= 0) {
        return [];
      }
      if (operator === AutomationConditionOperator.neq) {
        return this.orderRepo.find({
          where: {
            workspaceId: rule.workspaceId,
            statusId: Not(statusId),
          },
          take: limit,
        });
      }
      return this.orderRepo.find({
        where: {
          workspaceId: rule.workspaceId,
          statusId,
        },
        take: limit,
      });
    }

    const qb = this.orderRepo
      .createQueryBuilder("o")
      .innerJoin(OrderDeliveryInfo, "d", "d.id = o.delivery_id")
      .addSelect("d.delivery_status_at", "delivery_status_at")
      .addSelect("d.delivery_status", "delivery_status")
      .where("o.workspace_id = :workspaceId", {
        workspaceId: rule.workspaceId,
      })
      .andWhere("d.delivery_status_at IS NOT NULL")
      .limit(limit);

    if (operator === AutomationConditionOperator.neq) {
      qb.andWhere("d.delivery_status <> :sourceStatus", {
        sourceStatus: condition.sourceStatus,
      });
    } else {
      qb.andWhere("d.delivery_status = :sourceStatus", {
        sourceStatus: condition.sourceStatus,
      });
    }

    const rows = await qb.getRawAndEntities();

    return rows.entities.map((order, index) => {
      const raw = rows.raw[index] as {
        delivery_status_at?: Date | string | null;
        delivery_status?: string | null;
      };
      const rawAt = raw.delivery_status_at ?? null;
      return Object.assign(order, {
        deliveryStatusAt:
          rawAt instanceof Date ? rawAt : rawAt ? new Date(rawAt) : null,
        deliveryStatus: raw.delivery_status ?? null,
      });
    });
  }

  async applyAutomation(input: {
    automation: OrderStatusAutomation;
    workspaceId: number;
    orderId: number;
    sourceType: AutomationSourceType;
    conditionSourceStatus: string;
    operator: AutomationConditionOperator;
    observedSourceStatus: string;
    durationValue: number | null;
    durationUnit: AutomationDurationUnit | null;
    expectedStatusChangedAt: Date;
    timed: boolean;
  }): Promise<void> {
    const {
      automation,
      workspaceId,
      orderId,
      sourceType,
      conditionSourceStatus,
      operator,
      observedSourceStatus,
      durationValue,
      durationUnit,
      expectedStatusChangedAt,
      timed,
    } = input;

    const sourceStatus = observedSourceStatus || conditionSourceStatus;

    if (!automation.isActive) {
      await this.logSkippedExecution({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        reason: AutomationSkipReason.AUTOMATION_DISABLED,
        targetOrderStatusId: automation.targetOrderStatusId,
        automationName: automation.name,
        durationValue,
        durationUnit,
      });
      return;
    }

    const idempotencyKey = buildIdempotencyKey({
      sourceType,
      sourceStatus,
      statusChangedAt: expectedStatusChangedAt,
      timed,
    });

    const existing = await this.executionRepo.findOne({
      where: { automationId: automation.id, orderId, idempotencyKey },
    });
    if (existing) {
      return;
    }

    const order = await this.orderRepo.findOne({
      where: { workspaceId, id: orderId },
    });
    if (!order) {
      await this.logSkippedExecution({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        reason: AutomationSkipReason.ORDER_NOT_FOUND,
        targetOrderStatusId: automation.targetOrderStatusId,
        automationName: automation.name,
        durationValue,
        durationUnit,
        idempotencyKey,
      });
      return;
    }

    const currentSourceStatus = await this.resolveCurrentSourceStatus(
      order,
      sourceType,
    );
    const currentStatusChangedAt = await this.resolveCurrentStatusChangedAt(
      order,
      sourceType,
    );

    if (
      !matchesAutomationSourceStatus(
        operator,
        conditionSourceStatus,
        currentSourceStatus,
      )
    ) {
      await this.logSkippedExecution({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        reason: AutomationSkipReason.SOURCE_STATUS_CHANGED,
        targetOrderStatusId: automation.targetOrderStatusId,
        automationName: automation.name,
        durationValue,
        durationUnit,
        idempotencyKey,
      });
      return;
    }

    if (
      !currentStatusChangedAt ||
      !isSameStatusChangedAt(currentStatusChangedAt, expectedStatusChangedAt)
    ) {
      await this.logSkippedExecution({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        reason: AutomationSkipReason.STALE_STATUS_TIMESTAMP,
        targetOrderStatusId: automation.targetOrderStatusId,
        automationName: automation.name,
        durationValue,
        durationUnit,
        idempotencyKey,
      });
      return;
    }

    if (
      (automation.conditionType ?? AutomationConditionType.or) ===
      AutomationConditionType.and
    ) {
      const allMatched = await this.areAllConditionsSatisfied(
        order,
        automation.conditions ?? [],
      );
      if (!allMatched) {
        await this.logSkippedExecution({
          automation,
          workspaceId,
          orderId,
          sourceType,
          sourceStatus,
          expectedStatusChangedAt,
          timed,
          reason: AutomationSkipReason.CONDITIONS_NOT_MATCHED,
          targetOrderStatusId: automation.targetOrderStatusId,
          automationName: automation.name,
          durationValue,
          durationUnit,
          idempotencyKey,
        });
        return;
      }
    }

    if (timed) {
      if (durationValue == null || durationUnit == null) {
        await this.logSkippedExecution({
          automation,
          workspaceId,
          orderId,
          sourceType,
          sourceStatus,
          expectedStatusChangedAt,
          timed,
          reason: AutomationSkipReason.CONDITIONS_NOT_MATCHED,
          targetOrderStatusId: automation.targetOrderStatusId,
          automationName: automation.name,
          durationValue,
          durationUnit,
          idempotencyKey,
        });
        return;
      }
      const dueAt = addDuration(
        expectedStatusChangedAt,
        durationValue,
        durationUnit,
      );
      if (Date.now() < dueAt.getTime()) {
        await this.logSkippedExecution({
          automation,
          workspaceId,
          orderId,
          sourceType,
          sourceStatus,
          expectedStatusChangedAt,
          timed,
          reason: AutomationSkipReason.TIME_NOT_ELAPSED,
          targetOrderStatusId: automation.targetOrderStatusId,
          automationName: automation.name,
          durationValue,
          durationUnit,
          idempotencyKey,
        });
        return;
      }
    }

    if (order.statusId === automation.targetOrderStatusId) {
      await this.logSkippedExecution({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        reason: AutomationSkipReason.ORDER_ALREADY_IN_TARGET_STATUS,
        targetOrderStatusId: automation.targetOrderStatusId,
        automationName: automation.name,
        durationValue,
        durationUnit,
        idempotencyKey,
      });
      return;
    }

    try {
      const result = await this.orderStatusTransition.changeOrderStatus({
        workspaceId,
        orderId,
        targetStatusId: automation.targetOrderStatusId,
        actorId: null,
        changeSource: OrderStatusChangeSource.AUTOMATION,
        automation: {
          automationId: automation.id,
          automationName: automation.name,
          sourceType,
          sourceStatus,
          durationValue,
          durationUnit,
        },
      });

      if (!result.applied) {
        await this.logSkippedExecution({
          automation,
          workspaceId,
          orderId,
          sourceType,
          sourceStatus,
          expectedStatusChangedAt,
          timed,
          reason:
            result.skippedReason ??
            AutomationSkipReason.ORDER_ALREADY_IN_TARGET_STATUS,
          targetOrderStatusId: automation.targetOrderStatusId,
          automationName: automation.name,
          durationValue,
          durationUnit,
          idempotencyKey,
        });
        return;
      }

      await this.executionRepo.save(
        this.executionRepo.create({
          automationId: automation.id,
          workspaceId,
          orderId,
          status: AutomationExecutionStatus.applied,
          reason: null,
          previousOrderStatusId: result.previousStatusId,
          targetOrderStatusId: automation.targetOrderStatusId,
          sourceType,
          sourceStatusSnapshot: sourceStatus,
          expectedStatusChangedAt,
          idempotencyKey,
          automationNameSnapshot: automation.name,
          durationValue,
          durationUnit,
          executedAt: new Date(),
        }),
      );
      this.log.log(
        `Automation applied id=${automation.id} name="${automation.name}" workspace=${workspaceId} order=${orderId} ${result.previousStatusId}→${result.newStatusId} via ${sourceType}:${sourceStatus}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown automation error";
      this.log.error(
        `Automation ${automation.id} failed for order ${orderId}: ${message}`,
      );
      try {
        await this.executionRepo.save(
          this.executionRepo.create({
            automationId: automation.id,
            workspaceId,
            orderId,
            status: AutomationExecutionStatus.failed,
            reason: "FAILED",
            previousOrderStatusId: order.statusId,
            targetOrderStatusId: automation.targetOrderStatusId,
            sourceType,
            sourceStatusSnapshot: sourceStatus,
            expectedStatusChangedAt,
            idempotencyKey,
            automationNameSnapshot: automation.name,
            durationValue,
            durationUnit,
            errorCode: "APPLY_FAILED",
            errorMessage: message,
            executedAt: new Date(),
          }),
        );
      } catch (dupError) {
        const pgCode = (dupError as { code?: string })?.code;
        if (pgCode !== "23505") {
          throw dupError;
        }
      }
    }
  }

  private async areAllConditionsSatisfied(
    order: Order,
    conditions: OrderStatusAutomationCondition[],
  ): Promise<boolean> {
    for (const condition of conditions) {
      const satisfied = await this.isConditionSatisfied(order, condition);
      if (!satisfied) {
        return false;
      }
    }
    return conditions.length > 0;
  }

  private async isConditionSatisfied(
    order: Order,
    condition: OrderStatusAutomationCondition,
  ): Promise<boolean> {
    const currentStatus = await this.resolveCurrentSourceStatus(
      order,
      condition.sourceType,
    );
    if (
      !matchesAutomationSourceStatus(
        condition.operator ?? AutomationConditionOperator.eq,
        condition.sourceStatus,
        currentStatus,
      )
    ) {
      return false;
    }

    if (!isTimedCondition(condition)) {
      return true;
    }

    const changedAt = await this.resolveCurrentStatusChangedAt(
      order,
      condition.sourceType,
    );
    if (!changedAt) {
      return false;
    }

    const dueAt = addDuration(
      changedAt,
      condition.durationValue!,
      condition.durationUnit!,
    );
    return Date.now() >= dueAt.getTime();
  }

  private async resolveCurrentSourceStatus(
    order: Order,
    sourceType: AutomationSourceType,
  ): Promise<string | null> {
    if (sourceType === AutomationSourceType.payment_status) {
      return order.paymentStatus;
    }
    if (sourceType === AutomationSourceType.order_status) {
      return String(order.statusId);
    }
    if (order.deliveryId == null) {
      return null;
    }
    const delivery = await this.deliveryRepo.findOne({
      where: { id: order.deliveryId },
    });
    return delivery?.deliveryStatus ?? null;
  }

  private async resolveCurrentStatusChangedAt(
    order: Order,
    sourceType: AutomationSourceType,
  ): Promise<Date | null> {
    if (sourceType === AutomationSourceType.payment_status) {
      return order.paymentStatusAt;
    }
    if (sourceType === AutomationSourceType.order_status) {
      return order.statusChangedAt;
    }
    if (order.deliveryId == null) {
      return null;
    }
    const delivery = await this.deliveryRepo.findOne({
      where: { id: order.deliveryId },
    });
    return delivery?.deliveryStatusAt ?? null;
  }

  private async logSkippedExecution(input: {
    automation: OrderStatusAutomation | null;
    workspaceId: number;
    orderId: number;
    sourceType: AutomationSourceType;
    sourceStatus: string;
    expectedStatusChangedAt: Date;
    timed: boolean;
    reason: string;
    targetOrderStatusId: number;
    automationName: string;
    durationValue: number | null;
    durationUnit: string | null;
    idempotencyKey?: string;
  }): Promise<void> {
    if (!input.automation) {
      return;
    }
    this.log.warn(
      `Automation skipped id=${input.automation.id} name="${input.automationName}" workspace=${input.workspaceId} order=${input.orderId} reason=${input.reason} source=${input.sourceType}:${input.sourceStatus}`,
    );
    const idempotencyKey =
      input.idempotencyKey ??
      buildIdempotencyKey({
        sourceType: input.sourceType,
        sourceStatus: input.sourceStatus,
        statusChangedAt: input.expectedStatusChangedAt,
        timed: input.timed,
      });

    try {
      await this.executionRepo.save(
        this.executionRepo.create({
          automationId: input.automation.id,
          workspaceId: input.workspaceId,
          orderId: input.orderId,
          status: AutomationExecutionStatus.skipped,
          reason: input.reason,
          previousOrderStatusId: null,
          targetOrderStatusId: input.targetOrderStatusId,
          sourceType: input.sourceType,
          sourceStatusSnapshot: input.sourceStatus,
          expectedStatusChangedAt: input.expectedStatusChangedAt,
          idempotencyKey,
          automationNameSnapshot: input.automationName,
          durationValue: input.durationValue,
          durationUnit: input.durationUnit,
          executedAt: new Date(),
        }),
      );
    } catch (error) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === "23505") {
        return;
      }
      throw error;
    }
  }
}

/** Tolerate DB timestamp round-trip precision differences. */
function isSameStatusChangedAt(left: Date, right: Date): boolean {
  return Math.abs(left.getTime() - right.getTime()) <= 1000;
}
