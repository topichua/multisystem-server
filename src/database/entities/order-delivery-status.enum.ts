/** Persisted as PostgreSQL enum `orders_delivery_status_enum` on `order_delivery_infos.delivery_status`. */
export enum OrderDeliveryStatus {
  /** Delivery address/warehouse set; no TTN yet. */
  pending = "pending",
  /** TTN (waybill) created; not yet handed to the carrier. */
  waybill_created = "waybill_created",
  /** Handed to the carrier / left the sender. */
  shipped = "shipped",
  /** At the recipient branch or pickup point. */
  at_branch = "at_branch",
  /** Received by the customer. */
  delivered = "delivered",
  /** Delivery attempt failed / could not be completed. */
  delivery_failed = "delivery_failed",
  /** Returned to sender. */
  returned = "returned",
}
