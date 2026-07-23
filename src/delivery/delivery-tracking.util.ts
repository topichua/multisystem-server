import { Order } from "../database/entities/order.entity";
import { OrderDeliveryInfo } from "../database/entities/order-delivery-info.entity";
import { OrderDeliveryProvider } from "../database/entities/order-delivery-provider.enum";
import { OrderDeliveryStatus } from "../database/entities/order-delivery-status.enum";

const STATUSES_BEFORE_SHIPPED = new Set<OrderDeliveryStatus>([
  OrderDeliveryStatus.pending,
  OrderDeliveryStatus.waybill_created,
]);

/** TTN can be removed only before the parcel is handed to the carrier. */
export function canRemoveDeliveryTracking(
  delivery: OrderDeliveryInfo | null | undefined,
): boolean {
  if (!delivery) {
    return false;
  }
  if (delivery.provider !== OrderDeliveryProvider.nova_poshta) {
    return false;
  }
  if (!delivery.trackingNumber?.trim()) {
    return false;
  }
  return STATUSES_BEFORE_SHIPPED.has(delivery.deliveryStatus);
}

/** COD payment can be synced when COD amount is set and TTN exists. */
export function canSyncDeliveryPayment(
  delivery: OrderDeliveryInfo | null | undefined,
): boolean {
  if (!delivery) {
    return false;
  }
  const codAmount = delivery.cashOnDeliveryAmount;
  if (codAmount == null || !(codAmount > 0)) {
    return false;
  }
  return Boolean(delivery.trackingNumber?.trim());
}

export function hydrateDeliveryTrackingFlags(
  order: Order,
  delivery: OrderDeliveryInfo | null,
): void {
  const canRemove = canRemoveDeliveryTracking(delivery);
  order.canRemoveTracking = canRemove;
  if (delivery) {
    delivery.canRemoveTracking = canRemove;
    delivery.canSyncPayment = canSyncDeliveryPayment(delivery);
  }
  order.deliveryInfo = delivery;
}
