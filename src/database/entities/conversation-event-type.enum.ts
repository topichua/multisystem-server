/** Append-only audit trail for conversation workflow changes. */
export enum ConversationEventType {
  CONVERSATION_CREATED = "conversation_created",
  GROUP_CHANGED = "group_changed",
  RESPONSIBLE_CHANGED = "responsible_changed",
  ORDER_CREATED = "order_created",
}
