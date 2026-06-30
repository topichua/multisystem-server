/** Persisted as PostgreSQL enum `orders_delivery_status_enum` on `order_delivery_infos.delivery_status`. */
export enum OrderDeliveryStatus {
  pending = "pending",
  shipped = "shipped",
  delivered = "delivered",
  returned = "returned",
}
