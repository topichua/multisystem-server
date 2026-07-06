import { Api, utils } from "telegram";

export function gramClassName(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const name = (value as { className?: unknown }).className;
  return typeof name === "string" && name.length > 0 ? name : null;
}

export function isGramUpdateMessageReactions(
  update: unknown,
): update is Api.UpdateMessageReactions {
  return (
    update instanceof Api.UpdateMessageReactions ||
    gramClassName(update) === "UpdateMessageReactions"
  );
}

export function isGramMessageReactions(
  value: unknown,
): value is Api.MessageReactions {
  return (
    value instanceof Api.MessageReactions ||
    gramClassName(value) === "MessageReactions"
  );
}

export function isGramMessagePeerReaction(
  value: unknown,
): value is Api.MessagePeerReaction {
  return (
    value instanceof Api.MessagePeerReaction ||
    gramClassName(value) === "MessagePeerReaction"
  );
}

export function isGramReactionCount(value: unknown): value is Api.ReactionCount {
  return (
    value instanceof Api.ReactionCount || gramClassName(value) === "ReactionCount"
  );
}

export function gramBigIntToId(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && "value" in (value as object)) {
    return String((value as { value: bigint }).value);
  }
  return String(value).trim();
}

export function extractGramPeerUserId(peer: unknown): string | null {
  if (!peer || typeof peer !== "object") {
    return null;
  }
  const isPeerUser =
    peer instanceof Api.PeerUser || gramClassName(peer) === "PeerUser";
  if (!isPeerUser) {
    return null;
  }
  try {
    return utils.getPeerId(peer as Api.TypePeer);
  } catch {
    const userId = (peer as { userId?: unknown }).userId;
    const id = gramBigIntToId(userId);
    return id || null;
  }
}

export function extractGramReactionEmoticon(
  reaction: unknown,
): string | null {
  if (!reaction || typeof reaction !== "object") {
    return null;
  }
  const className = gramClassName(reaction);
  if (
    reaction instanceof Api.ReactionEmoji ||
    className === "ReactionEmoji"
  ) {
    const emoticon = (reaction as Api.ReactionEmoji).emoticon?.trim();
    return emoticon || null;
  }
  if (
    reaction instanceof Api.ReactionCustomEmoji ||
    className === "ReactionCustomEmoji"
  ) {
    const documentId = (reaction as Api.ReactionCustomEmoji).documentId;
    return `custom:${gramBigIntToId(documentId)}`;
  }
  if (reaction instanceof Api.ReactionPaid || className === "ReactionPaid") {
    return "paid";
  }
  return null;
}
