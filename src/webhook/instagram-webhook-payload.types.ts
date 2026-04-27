export type InstagramWebhookObject = 'instagram';

export interface InstagramWebhookPayload {
  object: InstagramWebhookObject;
  entry: InstagramWebhookEntry[];
}

export interface InstagramWebhookEntry {
  time: number;
  id: string;
  messaging: InstagramWebhookMessagingItem[];
}

/**
 * Message reaction on a webhook (subscribe to `message_reactions` / equivalent in the Instagram app).
 * The actor is the sibling `sender` on {@link InstagramWebhookMessagingItem}, not inside this object.
 *
 * @example
 * {
 *   "mid": "aWdf…ZD",
 *   "action": "react",
 *   "reaction": "other",
 *   "emoji": "❤"
 * }
 * `reaction` is often a preset name; when it is `"other"`, the real character is in `emoji`.
 */
export interface InstagramWebhookReaction {
  mid?: string;
  action?: 'react' | 'unreact' | string;
  /**
   * Preset bucket from Meta (`like`, `love`, `other`, …). If `other`, check `emoji` for the glyph.
   */
  reaction?: string;
  /** Present especially when `reaction` is `other` (e.g. ❤️). */
  emoji?: string;
}

export interface InstagramWebhookMessagingItem {
  timestamp?: number;
  read?: {
    mid: string;
  };
  message_edit?: {
    mid: string;
    num_edit: number;
  };
  /** Who performed the action (e.g. user who reacted). */
  sender?: { id: string };
  recipient?: { id: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
  /** Instagram / Messenger messaging reaction on a message. */
  reaction?: InstagramWebhookReaction;
}

export function isInstagramWebhookPayload(
  value: unknown,
): value is InstagramWebhookPayload {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (o.object !== 'instagram') {
    return false;
  }
  if (!Array.isArray(o.entry)) {
    return false;
  }
  return true;
}
