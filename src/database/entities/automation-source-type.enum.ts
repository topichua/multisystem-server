/** Persisted as PostgreSQL enum `automation_source_type_enum`. */
export enum AutomationSourceType {
  delivery_status = "DELIVERY_STATUS",
  payment_status = "PAYMENT_STATUS",
  /** Workspace order status by numeric id (as string in `sourceStatus`). */
  order_status = "ORDER_STATUS",
}
