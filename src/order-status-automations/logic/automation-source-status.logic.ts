import { OrderDeliveryStatus } from "../../database/entities/order-delivery-status.enum";
import { OrderPaymentStatus } from "../../database/entities/order-payment-status.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";

const DELIVERY_SOURCE_STATUSES = new Set<string>(
  Object.values(OrderDeliveryStatus),
);

const PAYMENT_SOURCE_STATUSES = new Set<string>(
  Object.values(OrderPaymentStatus),
);

export function isValidAutomationSourceStatus(
  sourceType: AutomationSourceType,
  sourceStatus: string,
): boolean {
  const normalized = sourceStatus.trim();
  if (sourceType === AutomationSourceType.delivery_status) {
    return DELIVERY_SOURCE_STATUSES.has(normalized);
  }
  return PAYMENT_SOURCE_STATUSES.has(normalized);
}

export function normalizeAutomationSourceStatus(sourceStatus: string): string {
  return sourceStatus.trim().toLowerCase();
}
