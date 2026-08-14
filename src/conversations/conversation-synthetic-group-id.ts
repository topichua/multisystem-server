/**
 * Synthetic conversation "group" ids accepted by GET /conversations?groupIds=.
 * These are not rows in `conversation_groups`.
 */
export const ConversationSyntheticGroupId = {
  /** Chats with a PENDING follow-up reminder ("Нагадати клієнту пізніше"). */
  pendingFollowUp: -1,
} as const;

export type ConversationSyntheticGroupIdValue =
  (typeof ConversationSyntheticGroupId)[keyof typeof ConversationSyntheticGroupId];

export const CONVERSATION_SYNTHETIC_GROUP_IDS = new Set<number>(
  Object.values(ConversationSyntheticGroupId),
);

export function isConversationSyntheticGroupId(id: number): boolean {
  return CONVERSATION_SYNTHETIC_GROUP_IDS.has(id);
}
