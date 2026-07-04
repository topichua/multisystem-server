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

export function hydrateDeliveryTrackingFlags(
  order: Order,
  delivery: OrderDeliveryInfo | null,
): void {
  const canRemove = canRemoveDeliveryTracking(delivery);
  order.canRemoveTracking = canRemove;
  if (delivery) {
    delivery.canRemoveTracking = canRemove;
  }
  order.deliveryInfo = delivery;
}
