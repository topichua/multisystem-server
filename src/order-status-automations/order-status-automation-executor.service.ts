import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AutomationExecutionStatus,
  AutomationSourceType,
  Order,
  OrderDeliveryInfo,
  OrderStatusAutomation,
  OrderStatusAutomationExecution,
} from "../database/entities";
import {
  addDuration,
  buildIdempotencyKey,
} from "./logic/automation-duration.logic";
import {
  AutomationSkipReason,
} from "./order-status-automation.constants";
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
    private readonly orderStatusTransition: OrderStatusTransitionService,
  ) {}

  async evaluateImmediateRules(
    input: EvaluateImmediateRulesInput,
  ): Promise<void> {
    const rules = await this.automationRepo.find({
      where: {
        workspaceId: input.workspaceId,
        isActive: true,
        sourceType: input.sourceType,
        sourceStatus: input.sourceStatus,
      },
    });

    const immediateRules = rules.filter(
      (rule) => rule.durationValue == null && rule.durationUnit == null,
    );

    for (const rule of immediateRules) {
      await this.applyAutomation({
        automation: rule,
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        sourceType: input.sourceType,
        sourceStatus: input.sourceStatus,
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
    const rules = await this.automationRepo.find({
      where: {
        ...(input.workspaceId != null ? { workspaceId: input.workspaceId } : {}),
        isActive: true,
        sourceType: input.sourceType,
      },
    });

    const timedRules = rules.filter(
      (rule) => rule.durationValue != null && rule.durationUnit != null,
    );

    let evaluated = 0;
    for (const rule of timedRules) {
      const candidates = await this.findTimedRuleCandidates(
        rule,
        input.limitPerRule ?? 100,
      );

      for (const candidate of candidates) {
        const statusChangedAt =
          input.sourceType === AutomationSourceType.delivery_status
            ? candidate.deliveryStatusAt
            : candidate.paymentStatusAt;
        if (!statusChangedAt) {
          continue;
        }

        const dueAt = addDuration(
          statusChangedAt,
          rule.durationValue!,
          rule.durationUnit!,
        );
        if (dueAt.getTime() > Date.now()) {
          continue;
        }

        await this.applyAutomation({
          automation: rule,
          workspaceId: candidate.workspaceId,
          orderId: candidate.id,
          sourceType: rule.sourceType,
          sourceStatus: rule.sourceStatus,
          expectedStatusChangedAt: statusChangedAt,
          timed: true,
        });
        evaluated += 1;
      }
    }

    return evaluated;
  }

  private async findTimedRuleCandidates(
    rule: OrderStatusAutomation,
    limit: number,
  ): Promise<
    Array<
      Order & {
        deliveryStatusAt?: Date | null;
      }
    >
  > {
    if (rule.sourceType === AutomationSourceType.payment_status) {
      return this.orderRepo.find({
        where: {
          workspaceId: rule.workspaceId,
          paymentStatus: rule.sourceStatus as Order["paymentStatus"],
        },
        take: limit,
      });
    }

    const rows = await this.orderRepo
      .createQueryBuilder("o")
      .innerJoin(OrderDeliveryInfo, "d", "d.id = o.delivery_id")
      .addSelect("d.delivery_status_at", "delivery_status_at")
      .where("o.workspace_id = :workspaceId", {
        workspaceId: rule.workspaceId,
      })
      .andWhere("d.delivery_status = :sourceStatus", {
        sourceStatus: rule.sourceStatus,
      })
      .andWhere("d.delivery_status_at IS NOT NULL")
      .limit(limit)
      .getRawAndEntities();

    return rows.entities.map((order, index) => {
      const raw = rows.raw[index] as { delivery_status_at?: Date | string | null };
      const rawAt = raw.delivery_status_at ?? null;
      return Object.assign(order, {
        deliveryStatusAt:
          rawAt instanceof Date ? rawAt : rawAt ? new Date(rawAt) : null,
      });
    });
  }

  async applyAutomation(input: {
    automation: OrderStatusAutomation;
    workspaceId: number;
    orderId: number;
    sourceType: AutomationSourceType;
    sourceStatus: string;
    expectedStatusChangedAt: Date;
    timed: boolean;
  }): Promise<void> {
    const {
      automation,
      workspaceId,
      orderId,
      sourceType,
      sourceStatus,
      expectedStatusChangedAt,
      timed,
    } = input;

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
        durationValue: automation.durationValue,
        durationUnit: automation.durationUnit,
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
        durationValue: automation.durationValue,
        durationUnit: automation.durationUnit,
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

    if (currentSourceStatus !== sourceStatus) {
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
        durationValue: automation.durationValue,
        durationUnit: automation.durationUnit,
        idempotencyKey,
      });
      return;
    }

    if (
      !currentStatusChangedAt ||
      currentStatusChangedAt.getTime() !== expectedStatusChangedAt.getTime()
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
        durationValue: automation.durationValue,
        durationUnit: automation.durationUnit,
        idempotencyKey,
      });
      return;
    }

    if (timed) {
      if (
        automation.durationValue == null ||
        automation.durationUnit == null
      ) {
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
          durationValue: automation.durationValue,
          durationUnit: automation.durationUnit,
          idempotencyKey,
        });
        return;
      }
      const dueAt = addDuration(
        expectedStatusChangedAt,
        automation.durationValue,
        automation.durationUnit,
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
          durationValue: automation.durationValue,
          durationUnit: automation.durationUnit,
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
        durationValue: automation.durationValue,
        durationUnit: automation.durationUnit,
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
          durationValue: automation.durationValue,
          durationUnit: automation.durationUnit,
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
          durationValue: automation.durationValue,
          durationUnit: automation.durationUnit,
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
          durationValue: automation.durationValue,
          durationUnit: automation.durationUnit,
          executedAt: new Date(),
        }),
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
            durationValue: automation.durationValue,
            durationUnit: automation.durationUnit,
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

  private async resolveCurrentSourceStatus(
    order: Order,
    sourceType: AutomationSourceType,
  ): Promise<string | null> {
    if (sourceType === AutomationSourceType.payment_status) {
      return order.paymentStatus;
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
