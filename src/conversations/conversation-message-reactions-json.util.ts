import type { ConversationMessage } from "../database/entities";
import type {
  ConversationMessageReactionDto,
  ConversationMessageReactionFrom,
} from "./dto/http/conversation-message-reaction.dto";
import type { InstagramMessageReactionsDto } from "./dto/http/instagram-messages-response.dto";

export type StoredMessageReaction = {
  reaction: string;
  at: string;
  from: ConversationMessageReactionFrom;
};

function normalizeStoredReaction(item: unknown): StoredMessageReaction | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const raw = item as Record<string, unknown>;
  const reaction = typeof raw.reaction === "string" ? raw.reaction.trim() : "";
  const from =
    raw.from === "sender" || raw.from === "receiver" ? raw.from : null;
  if (!reaction || !from) {
    return null;
  }

  let atIso: string | null = null;
  if (typeof raw.at === "string" && raw.at.trim()) {
    const parsed = new Date(raw.at);
    if (!Number.isNaN(parsed.getTime())) {
      atIso = parsed.toISOString();
    }
  } else if (raw.at instanceof Date && !Number.isNaN(raw.at.getTime())) {
    atIso = raw.at.toISOString();
  }
  if (!atIso) {
    return null;
  }

  return { reaction, at: atIso, from };
}

export function parseReactionsJson(
  raw: string | null | undefined,
): StoredMessageReaction[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeStoredReaction(item))
      .filter((item): item is StoredMessageReaction => item != null);
  } catch {
    return [];
  }
}

export function serializeReactionsJson(
  reactions: StoredMessageReaction[],
): string | null {
  if (reactions.length === 0) {
    return null;
  }
  return JSON.stringify(reactions);
}

export function mapReactionsJsonForApi(
  raw: string | null | undefined,
): ConversationMessageReactionDto[] | undefined {
  const reactions = parseReactionsJson(raw);
  if (reactions.length === 0) {
    return undefined;
  }
  return reactions;
}

/** Best-effort Instagram `instagram_json.reactions` → unified reactions shape. */
export function mapInstagramStoredReactionsForApi(
  row: ConversationMessage,
  stored: InstagramMessageReactionsDto | undefined,
): ConversationMessageReactionDto[] | undefined {
  const data = stored?.data ?? [];
  if (data.length === 0) {
    return undefined;
  }

  const fallbackAt =
    row.systemUpdatedAt?.toISOString() ?? row.createdAt.toISOString();
  const out: ConversationMessageReactionDto[] = [];

  for (const item of data) {
    const reaction = item.emoji?.trim() || item.reaction?.trim() || "";
    if (!reaction) {
      continue;
    }
    for (const user of item.users ?? []) {
      const userId = user.id?.trim();
      if (!userId) {
        continue;
      }
      let from: ConversationMessageReactionFrom | null = null;
      if (userId === row.senderId?.trim()) {
        from = "sender";
      } else if (userId === row.receiverId?.trim()) {
        from = "receiver";
      }
      if (!from) {
        continue;
      }
      out.push({ reaction, at: fallbackAt, from });
    }
  }

  return out.length > 0 ? out : undefined;
}
