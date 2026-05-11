/**
 * Groups custom workspace statuses for workflows / UI.
 * Persisted as PostgreSQL enum `order_statuses_category_enum`.
 */
export enum OrderStatusCategory {
  new = "new",
  confirmed = "confirmed",
  packed = "packed",
  shipped = "shipped",
  completed = "completed",
  canceled = "canceled",
}
