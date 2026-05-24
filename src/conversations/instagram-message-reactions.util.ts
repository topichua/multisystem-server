import type {
  InstagramMessageReactionItemDto,
  InstagramMessageReactionsDto,
} from "./dto/http/instagram-messages-response.dto";
import type { InstagramWebhookMessagingItem } from "../webhook/instagram-webhook-payload.types";

function reactionItemMatches(
  item: InstagramMessageReactionItemDto,
  emoji?: string,
  reactionType?: string,
): boolean {
  if (emoji && (item.emoji === emoji || item.reaction === emoji)) {
    return true;
  }
  if (reactionType && item.reaction === reactionType) {
    return true;
  }
  return false;
}

function normalizeReactionItem(
  item: InstagramMessageReactionItemDto,
): InstagramMessageReactionItemDto {
  const emoji = item.emoji?.trim();
  const reaction = item.reaction?.trim() || emoji;
  return {
    ...(reaction ? { reaction } : {}),
    ...(emoji ? { emoji } : {}),
    users: (item.users ?? [])
      .map((u) => {
        const id = u.id?.trim();
        if (!id) return null;
        const username = u.username?.trim();
        return username ? { id, username } : { id };
      })
      .filter((u): u is { id: string; username?: string } => u != null),
  };
}

/**
 * Builds the `reactions` object for GET messages / WebSocket from stored `instagram_json`.
 * Uses top-level `reactions` when present; enriches emoji from `webhook_messaging`; can
 * synthesize from a reaction webhook payload when Graph data was never stored.
 */
export function resolveReactionsForApiFromStoredJson(
  parsed: Record<string, unknown>,
): InstagramMessageReactionsDto | undefined {
  const stored = parsed.reactions as InstagramMessageReactionsDto | undefined;
  let data = (stored?.data ?? [])
    .map((item) => normalizeReactionItem(item))
    .filter(
      (item) =>
        (item.users?.length ?? 0) > 0 ||
        Boolean(item.reaction) ||
        Boolean(item.emoji),
    );

  const webhook = parsed.webhook_messaging as
    | InstagramWebhookMessagingItem
    | undefined;
  const webhookReaction = webhook?.reaction;
  const senderId = webhook?.sender?.id?.trim();
  const webhookEmoji = webhookReaction?.emoji?.trim();
  const webhookType = webhookReaction?.reaction?.trim();
  const action = (webhookReaction?.action ?? "react").trim().toLowerCase();

  if (webhookReaction && (webhookEmoji || webhookType) && senderId) {
    if (action === "unreact") {
      data = data
        .map((item) => {
          if (!reactionItemMatches(item, webhookEmoji, webhookType)) {
            return item;
          }
          return {
            ...item,
            users: (item.users ?? []).filter((u) => u.id?.trim() !== senderId),
          };
        })
        .filter((item) => (item.users?.length ?? 0) > 0);
    } else {
      let item = data.find((i) =>
        reactionItemMatches(i, webhookEmoji, webhookType),
      );
      if (!item) {
        item = normalizeReactionItem({
          reaction: webhookType || webhookEmoji,
          ...(webhookEmoji ? { emoji: webhookEmoji } : {}),
          users: [{ id: senderId }],
        });
        data.push(item);
      } else {
        if (webhookEmoji) {
          item.emoji = webhookEmoji;
        }
        if (webhookType && !item.reaction) {
          item.reaction = webhookType;
        }
        const users = item.users ?? [];
        if (!users.some((u) => u.id?.trim() === senderId)) {
          users.push({ id: senderId });
        }
        item.users = users;
      }
    }
  }

  if (data.length === 0) {
    return undefined;
  }
  return { data };
}

/** Keeps reactions from DB when Graph sync returns a message without them. */
export function mergeMessageJsonPreservingReactions(
  existingInstagramJson: string,
  messageWithoutId: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...messageWithoutId };
  const nextData = (next.reactions as InstagramMessageReactionsDto | undefined)
    ?.data;
  if (nextData != null && nextData.length > 0) {
    return next;
  }
  try {
    const existing = JSON.parse(existingInstagramJson) as Record<
      string,
      unknown
    >;
    const kept = resolveReactionsForApiFromStoredJson(existing);
    if (kept?.data?.length) {
      next.reactions = kept;
    }
  } catch {
    /* keep next as-is */
  }
  return next;
}
