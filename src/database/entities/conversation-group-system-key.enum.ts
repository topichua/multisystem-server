/** Built-in conversation group keys (stored in `conversation_groups.system_key`). */
export enum ConversationGroupSystemKey {
  NEW = "new",
  PROCESSING = "processing",
  ARCHIVED = "archived",
}

export const CONVERSATION_GROUP_SYSTEM_DEFAULTS: Record<
  ConversationGroupSystemKey,
  { name: string; color: string; sortOrder: number }
> = {
  [ConversationGroupSystemKey.NEW]: {
    name: "Новий",
    color: "#3B82F6",
    sortOrder: 0,
  },
  [ConversationGroupSystemKey.PROCESSING]: {
    name: "Обробка",
    color: "#F59E0B",
    sortOrder: 1,
  },
  [ConversationGroupSystemKey.ARCHIVED]: {
    name: "Архів",
    color: "#6B7280",
    sortOrder: 2,
  },
};
