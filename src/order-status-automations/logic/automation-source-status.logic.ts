import { OrderDeliveryStatus } from "../../database/entities/order-delivery-status.enum";
import { OrderPaymentStatus } from "../../database/entities/order-payment-status.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";

const DELIVERY_SOURCE_STATUSES = new Set<string>(
  Object.values(OrderDeliveryStatus),
);

const PAYMENT_SOURCE_STATUSES = new Set<string>(
  Object.values(OrderPaymentStatus),
);

/**
 * Normalize condition sourceStatus for storage/matching.
 * ORDER_STATUS keeps numeric id as decimal string (no zero padding).
 */
export function normalizeAutomationSourceStatus(
  sourceType: AutomationSourceType,
  sourceStatus: string,
): string {
  const raw = sourceStatus.trim();
  if (sourceType === AutomationSourceType.order_status) {
    if (!/^\d+$/.test(raw)) {
      return raw;
    }
    return String(Number(raw));
  }
  return raw.toLowerCase();
}

export function isValidAutomationSourceStatus(
  sourceType: AutomationSourceType,
  sourceStatus: string,
): boolean {
  const normalized = sourceStatus.trim();
  if (sourceType === AutomationSourceType.delivery_status) {
    return DELIVERY_SOURCE_STATUSES.has(normalized);
  }
  if (sourceType === AutomationSourceType.payment_status) {
    return PAYMENT_SOURCE_STATUSES.has(normalized);
  }
  if (sourceType === AutomationSourceType.order_status) {
    return /^\d+$/.test(normalized) && Number(normalized) > 0;
  }
  return false;
}

export function parseOrderStatusConditionId(
  sourceStatus: string,
): number | null {
  const normalized = sourceStatus.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const id = Number(normalized);
  return Number.isInteger(id) && id > 0 ? id : null;
}
