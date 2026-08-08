/** Persisted as PostgreSQL enum `automation_action_type_enum`. */
export enum AutomationActionType {
  change_order_status = "CHANGE_ORDER_STATUS",
  /** Move the order-linked conversation to a workspace conversation group (e.g. archive). */
  change_conversation_group = "CHANGE_CONVERSATION_GROUP",
}
