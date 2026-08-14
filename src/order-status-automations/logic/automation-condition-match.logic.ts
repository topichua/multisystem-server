import {
  AutomationConditionOperator,
  AutomationConditionType,
  AutomationSourceType,
  Order,
  OrderDeliveryInfo,
  OrderStatusAutomationCondition,
} from "../../database/entities";
import {
  isTimedCondition,
  matchesAutomationSourceStatus,
} from "./automation-conditions.logic";
import { addDuration } from "./automation-duration.logic";

export type AutomationConditionStatusResolver = {
  resolveCurrentSourceStatus(
    order: Order,
    sourceType: AutomationSourceType,
  ): Promise<string | null>;
  resolveCurrentStatusChangedAt(
    order: Order,
    sourceType: AutomationSourceType,
  ): Promise<Date | null>;
};

export async function resolveSourceStatusFromOrder(
  order: Order,
  sourceType: AutomationSourceType,
  deliveryRepo: {
    findOne: (opts: {
      where: { id: number };
    }) => Promise<OrderDeliveryInfo | null>;
  },
): Promise<string | null> {
  if (sourceType === AutomationSourceType.payment_status) {
    return order.paymentStatus;
  }
  if (sourceType === AutomationSourceType.order_status) {
    return order.statusId != null ? String(order.statusId) : null;
  }
  if (order.deliveryId == null) {
    return null;
  }
  const delivery = await deliveryRepo.findOne({
    where: { id: order.deliveryId },
  });
  return delivery?.deliveryStatus ?? null;
}

export async function resolveStatusChangedAtFromOrder(
  order: Order,
  sourceType: AutomationSourceType,
  deliveryRepo: {
    findOne: (opts: {
      where: { id: number };
    }) => Promise<OrderDeliveryInfo | null>;
  },
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
  const delivery = await deliveryRepo.findOne({
    where: { id: order.deliveryId },
  });
  return delivery?.deliveryStatusAt ?? null;
}

export async function isAutomationConditionSatisfied(
  order: Order,
  condition: OrderStatusAutomationCondition,
  resolver: AutomationConditionStatusResolver,
): Promise<boolean> {
  const currentStatus = await resolver.resolveCurrentSourceStatus(
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

  const changedAt = await resolver.resolveCurrentStatusChangedAt(
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

export async function areAutomationConditionsMatched(
  order: Order,
  conditions: OrderStatusAutomationCondition[],
  conditionType: AutomationConditionType,
  resolver: AutomationConditionStatusResolver,
): Promise<boolean> {
  if (conditions.length === 0) {
    return false;
  }
  if (conditionType === AutomationConditionType.and) {
    for (const condition of conditions) {
      const ok = await isAutomationConditionSatisfied(
        order,
        condition,
        resolver,
      );
      if (!ok) return false;
    }
    return true;
  }
  for (const condition of conditions) {
    const ok = await isAutomationConditionSatisfied(order, condition, resolver);
    if (ok) return true;
  }
  return false;
}
