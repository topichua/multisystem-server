/** Built-in conversation group keys (stored in `conversation_groups.system_key`). */
export enum ConversationGroupSystemKey {
  NEW = "new",
  PROCESSING = "processing",
  ARCHIVED = "archived",
  SPAM = "spam",
}

/** System groups omitted from the default conversation list and counter totals. */
export const CONVERSATION_GROUP_SYSTEM_KEYS_HIDDEN_FROM_DEFAULT_LIST: ConversationGroupSystemKey[] =
  [ConversationGroupSystemKey.ARCHIVED, ConversationGroupSystemKey.SPAM];

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
  [ConversationGroupSystemKey.SPAM]: {
    name: "Спам",
    color: "#EF4444",
    sortOrder: 3,
  },
};
