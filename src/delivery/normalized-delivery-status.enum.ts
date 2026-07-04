/** Provider-agnostic delivery lifecycle status (Nova Poshta polling / webhooks / dev simulator). */
export enum NormalizedDeliveryStatus {
  CREATED = "CREATED",
  IN_TRANSIT = "IN_TRANSIT",
  ARRIVED = "ARRIVED",
  DELIVERED = "DELIVERED",
  RETURNED = "RETURNED",
  DELIVERY_FAILED = "DELIVERY_FAILED",
}
