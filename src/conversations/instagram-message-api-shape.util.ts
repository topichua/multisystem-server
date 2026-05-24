import type { InstagramMessageDto } from "./dto/http/instagram-messages-response.dto";

/**
 * Stable GET `/conversations/:id/messages` item shape (and WebSocket `message`).
 * Whitelists fields only — no `conversation`, `reply_to`, or `webhook_messaging`.
 */
export type LegacyInstagramMessageApi = {
  id: string;
  created_time: string;
  from?: { id: string; name?: string; username?: string; email?: string };
  to?: { data?: Array<{ id: string; name?: string; username?: string }> };
  message?: string;
  attachments?: { data?: Array<Record<string, unknown>> };
  shares?: { data?: Array<Record<string, unknown>> };
  story?: Record<string, unknown>;
  reactions?: { data?: Array<Record<string, unknown>> };
  tags?: { data?: Array<{ name?: string }> };
  is_unsupported?: boolean;
  edited_at?: string;
  read_at?: string;
  system_updated_at: string;
  reply_to_id?: string;
  replied_to_message?: {
    id: string;
    created_time?: string;
    message?: string;
    attachments?: unknown;
    from?: { id: string; name?: string; username?: string };
  };
};

export function toLegacyInstagramMessageApiShape(
  msg: InstagramMessageDto,
): LegacyInstagramMessageApi {
  const out: LegacyInstagramMessageApi = {
    id: msg.id,
    created_time: msg.created_time,
    system_updated_at:
      msg.system_updated_at?.trim() ||
      msg.created_time ||
      new Date().toISOString(),
  };

  const fromId = msg.from?.id?.trim();
  if (fromId) {
    out.from = { id: fromId };
    const name = msg.from?.name?.trim();
    const username = msg.from?.username?.trim();
    const email = msg.from?.email?.trim();
    if (name) out.from.name = name;
    if (username) out.from.username = username;
    if (email) out.from.email = email;
  }

  const toData = msg.to?.data;
  if (toData != null && toData.length > 0) {
    const mapped = toData
      .map((actor) => {
        const id = actor.id?.trim();
        if (!id) return null;
        const entry: { id: string; name?: string; username?: string } = { id };
        const name = actor.name?.trim();
        const username = actor.username?.trim();
        if (name) entry.name = name;
        if (username) entry.username = username;
        return entry;
      })
      .filter(
        (entry): entry is { id: string; name?: string; username?: string } =>
          entry != null,
      );
    if (mapped.length > 0) {
      out.to = { data: mapped };
    }
  }

  const text = msg.message?.trim();
  if (text) {
    out.message = text;
  }

  if (msg.attachments != null) {
    out.attachments = msg.attachments as {
      data?: Array<Record<string, unknown>>;
    };
  }
  if (msg.shares != null) {
    out.shares = msg.shares as { data?: Array<Record<string, unknown>> };
  }
  if (msg.story != null) {
    out.story = msg.story as Record<string, unknown>;
  }
  if (msg.reactions?.data != null && msg.reactions.data.length > 0) {
    out.reactions = {
      data: msg.reactions.data as Array<Record<string, unknown>>,
    };
  }
  if (msg.tags?.data != null && msg.tags.data.length > 0) {
    out.tags = { data: msg.tags.data };
  }
  if (msg.is_unsupported === true) {
    out.is_unsupported = true;
  }
  if (msg.edited_at?.trim()) {
    out.edited_at = msg.edited_at.trim();
  }
  if (msg.read_at?.trim()) {
    out.read_at = msg.read_at.trim();
  }
  if (msg.reply_to_id?.trim()) {
    out.reply_to_id = msg.reply_to_id.trim();
  }

  if (msg.replied_to_message?.id) {
    const ref = msg.replied_to_message;
    out.replied_to_message = { id: ref.id };
    if (ref.created_time?.trim()) {
      out.replied_to_message.created_time = ref.created_time.trim();
    }
    const refMessage = ref.message?.trim();
    if (refMessage) {
      out.replied_to_message.message = refMessage;
    }
    if (ref.attachments != null) {
      out.replied_to_message.attachments = ref.attachments;
    }
    const refFromId = ref.from?.id?.trim();
    if (refFromId) {
      out.replied_to_message.from = { id: refFromId };
      const refName = ref.from?.name?.trim();
      const refUsername = ref.from?.username?.trim();
      if (refName) out.replied_to_message.from.name = refName;
      if (refUsername) out.replied_to_message.from.username = refUsername;
    }
  }

  return out;
}
