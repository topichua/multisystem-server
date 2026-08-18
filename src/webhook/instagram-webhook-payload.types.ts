export interface InstagramWebhookPayload {
  object: "instagram";
  entry: InstagramWebhookEntry[];
}

export interface InstagramWebhookEntry {
  time: number;
  id: string;
  messaging?: InstagramWebhookMessagingItem[];
  changes?: InstagramWebhookChange[];
}

export interface InstagramWebhookReaction {
  mid?: string;
  action?: string;
  reaction?: string;
  emoji?: string;
}

/** Payload for webhook `message.attachments[]` (shape varies by `type`). */
export interface InstagramWebhookMessageAttachmentPayload {
  url?: string;
  title?: string;
  /** Present when `type` is `ig_post`. */
  ig_post_media_id?: string;
  /** Present when `type` is `ig_reel`. */
  reel_video_id?: string;
  /** Image / video / audio / file CDN URL variants. */
  preview_url?: string;
  sticker_id?: number;
}

export interface InstagramWebhookMessageAttachment {
  /** e.g. `image`, `video`, `audio`, `file`, `share`, `ig_post`, `ig_reel`, `story_mention`. */
  type?: string;
  payload?: InstagramWebhookMessageAttachmentPayload;
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
  sender?: { id: string };
  recipient?: { id: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    reply_to?: {
      mid?: string;
      is_self_reply?: boolean;
    };
    attachments?: InstagramWebhookMessageAttachment[];
  };
  reaction?: InstagramWebhookReaction;
}

/** `entry.changes[]` item — comments, mentions, etc. */
export interface InstagramWebhookChange {
  field?: string;
  value?: InstagramWebhookCommentValue | Record<string, unknown>;
}

/** Instagram `comments` webhook `changes[].value`. */
export interface InstagramWebhookCommentFrom {
  id?: string;
  username?: string;
}

export interface InstagramWebhookCommentMedia {
  id?: string;
  media_product_type?: string;
  ad_id?: string;
  original_media_id?: string;
}

export interface InstagramWebhookCommentValue {
  id?: string;
  text?: string;
  /** Some payloads send `post_id` instead of (or in addition to) `media.id`. */
  post_id?: string;
  parent_id?: string;
  from?: InstagramWebhookCommentFrom;
  media?: InstagramWebhookCommentMedia;
}

const INSTAGRAM_COMMENT_WEBHOOK_FIELDS = new Set(["comments", "live_comments"]);

export function isInstagramWebhookPayload(
  value: unknown,
): value is InstagramWebhookPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (o.object !== "instagram") {
    return false;
  }
  if (!Array.isArray(o.entry)) {
    return false;
  }
  return true;
}

export function isInstagramWebhookEntry(
  value: unknown,
): value is InstagramWebhookEntry {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string") {
    return false;
  }
  const hasMessaging = Array.isArray(o.messaging);
  const hasChanges = Array.isArray(o.changes);
  return hasMessaging || hasChanges;
}

export function isInstagramWebhookCommentValue(
  value: unknown,
): value is InstagramWebhookCommentValue {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
  return typeof o.id === "string" && o.id.trim().length > 0;
}

export function isInstagramCommentWebhookChange(
  change: InstagramWebhookChange | undefined,
): change is InstagramWebhookChange & {
  field: string;
  value: InstagramWebhookCommentValue;
} {
  if (change == null) {
    return false;
  }
  const field = change.field?.trim();
  if (!field || !INSTAGRAM_COMMENT_WEBHOOK_FIELDS.has(field)) {
    return false;
  }
  return isInstagramWebhookCommentValue(change.value);
}

export function commentPostIdFromWebhookValue(
  value: InstagramWebhookCommentValue,
): string | null {
  const fromPostId = value.post_id?.trim();
  if (fromPostId) {
    return fromPostId;
  }
  const fromMedia = value.media?.id?.trim();
  return fromMedia || null;
}

export type ParsedInstagramWebhookRawPayload =
  | { kind: "payload"; payload: InstagramWebhookPayload }
  | { kind: "entry"; entry: InstagramWebhookEntry };

export function parseInstagramWebhookFromRawPayload(
  raw: Record<string, unknown>,
): ParsedInstagramWebhookRawPayload | null {
  if (isInstagramWebhookPayload(raw)) {
    return { kind: "payload", payload: raw };
  }
  if (isInstagramWebhookEntry(raw)) {
    return { kind: "entry", entry: raw };
  }
  return null;
}
