/** Append-only audit trail for conversation workflow changes. */
export enum ConversationEventType {
  CONVERSATION_CREATED = "conversation_created",
  GROUP_CHANGED = "group_changed",
  RESPONSIBLE_CHANGED = "responsible_changed",
  ORDER_CREATED = "order_created",
  FOLLOW_UP_CREATED = "follow_up_created",
  FOLLOW_UP_CHANGED = "follow_up_changed",
  FOLLOW_UP_DECLINED = "follow_up_declined",
  FOLLOW_UP_APPLIED = "follow_up_applied",
  RECOGNITION_DONE = "recognition_done",
}
