import type {
  InstagramMessageAttachmentDto,
  InstagramMessageAttachmentsDto,
  InstagramMessageDto,
  InstagramMessageShareDataDto,
  InstagramMessageSharesDto,
} from "./dto/http/instagram-messages-response.dto";
import { resolveInstagramMessageActors } from "./instagram-message-actors.util";
import type { ConversationMessageAttachmentType } from "./dto/http/conversation-message-attachment.dto";
import type { StoredMessageAttachment } from "./conversation-message-attachments-json.util";
import { serializeAttachmentsJson } from "./conversation-message-attachments-json.util";
import type {
  InstagramWebhookMessageAttachment,
  InstagramWebhookMessagingItem,
} from "../webhook/instagram-webhook-payload.types";

const SHARE_ATTACHMENT_TYPES = new Set([
  "share",
  "ig_post",
  "ig_reel",
  "reel",
  "story_mention",
]);

function isLikelyInstagramPsid(id: string | undefined): boolean {
  const t = id?.trim() ?? "";
  return t.length > 0 && t !== "unknown" && /^\d+$/.test(t);
}

/** Customer PSID from webhook sender/recipient (excludes business + page ids). */
export function pickCustomerUserIdFromWebhook(
  ev: InstagramWebhookMessagingItem,
  businessInstagramId: string,
  pageId?: string | null,
): string | null {
  const excludedIds = new Set(
    [businessInstagramId, pageId]
      .map((x) => x?.trim())
      .filter((x): x is string => Boolean(x)),
  );

  for (const candidate of [ev.sender?.id, ev.recipient?.id]) {
    const id = candidate?.trim();
    if (id && isLikelyInstagramPsid(id) && !excludedIds.has(id)) {
      return id;
    }
  }
  return null;
}

function mapWebhookAttachmentToGraphData(
  attachment: InstagramWebhookMessageAttachment,
): InstagramMessageAttachmentDto | null {
  const type = attachment.type?.trim().toLowerCase();
  const payload = attachment.payload ?? {};
  const url = payload.url?.trim();
  const previewUrl = payload.preview_url?.trim() || url;

  if (!type) {
    return null;
  }

  switch (type) {
    case "image":
      return url
        ? {
            image_data: {
              url,
              preview_url: previewUrl,
            },
          }
        : null;
    case "video":
      return url
        ? {
            video_data: {
              url,
              preview_url: previewUrl,
            },
          }
        : null;
    case "audio":
    case "file":
      return url
        ? {
            file_url: url,
            mime_type: type === "audio" ? "audio/*" : undefined,
          }
        : null;
    default:
      return {
        file_url: url,
        generic_template: {
          type: attachment.type,
          ...payload,
        },
      };
  }
}

function mapWebhookAttachmentsToGraphShape(
  attachments: InstagramWebhookMessageAttachment[],
): {
  attachments?: InstagramMessageAttachmentsDto;
  shares?: InstagramMessageSharesDto;
} {
  const attachmentData: InstagramMessageAttachmentDto[] = [];
  const shareData: InstagramMessageShareDataDto[] = [];

  for (const item of attachments) {
    const type = item.type?.trim().toLowerCase();
    const payload = item.payload ?? {};

    if (type && SHARE_ATTACHMENT_TYPES.has(type)) {
      shareData.push({
        type: item.type,
        url: payload.url,
        link: payload.url,
        name: payload.title,
        id: payload.ig_post_media_id ?? payload.reel_video_id,
      });
      continue;
    }

    const mapped = mapWebhookAttachmentToGraphData(item);
    if (mapped) {
      attachmentData.push(mapped);
    }
  }

  return {
    ...(attachmentData.length > 0
      ? { attachments: { data: attachmentData } }
      : {}),
    ...(shareData.length > 0 ? { shares: { data: shareData } } : {}),
  };
}

/** Build an `InstagramMessageDto` from webhook payload (no Graph fetch). */
export function webhookMessagingToInstagramMessageDto(
  ev: InstagramWebhookMessagingItem,
  options?: {
    businessInstagramId?: string | null;
    pageId?: string | null;
  },
): InstagramMessageDto {
  const mid =
    ev.message?.mid?.trim() || ev.message_edit?.mid?.trim() || "";
  const created_time = new Date(ev.timestamp ?? Date.now()).toISOString();
  const { senderId, receiverId } = resolveInstagramMessageActors({
    businessInstagramId: options?.businessInstagramId,
    pageId: options?.pageId,
    webhook: ev,
  });

  const msg: InstagramMessageDto = {
    id: mid,
    created_time,
    system_updated_at: created_time,
    message: ev.message?.text,
    ...(senderId && senderId !== "0" ? { from: { id: senderId } } : {}),
    ...(receiverId && receiverId !== "0"
      ? { to: { data: [{ id: receiverId }] } }
      : {}),
  };

  if (ev.message?.reply_to) {
    msg.reply_to = {
      mid: ev.message.reply_to.mid,
      is_self_reply: ev.message.reply_to.is_self_reply,
    };
  }

  const webhookAttachments = ev.message?.attachments ?? [];
  if (webhookAttachments.length > 0) {
    const mapped = mapWebhookAttachmentsToGraphShape(webhookAttachments);
    if (mapped.attachments?.data?.length) {
      msg.attachments =
        mapped.attachments as unknown as InstagramMessageDto["attachments"];
    }
    if (mapped.shares?.data?.length) {
      msg.shares = mapped.shares as InstagramMessageDto["shares"];
    }
  }

  return msg;
}

function resolveStoredAttachmentType(
  webhookType: string | undefined,
): ConversationMessageAttachmentType {
  switch (webhookType?.trim().toLowerCase()) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    default:
      return "file";
  }
}

/** Map webhook `message.attachments[]` → DB `attachment_json` rows. */
export function webhookAttachmentsToStoredAttachments(
  attachments: InstagramWebhookMessageAttachment[],
  at: string,
): StoredMessageAttachment[] {
  const out: StoredMessageAttachment[] = [];

  for (const item of attachments) {
    const payload = item.payload ?? {};
    const url = payload.url?.trim();
    if (!url) {
      continue;
    }

    const type = resolveStoredAttachmentType(item.type);
    const name = payload.title?.trim() || item.type?.trim() || "attachment";
    const key =
      payload.ig_post_media_id?.trim() ||
      payload.reel_video_id?.trim() ||
      url;

    out.push({
      type,
      key,
      url,
      at,
      name,
      ...(type !== "image" ? { r2_key: key } : {}),
    });
  }

  return out;
}

/** Serialize webhook attachments for `conversation_messages.attachment_json`. */
export function serializeWebhookAttachmentsJson(
  ev: InstagramWebhookMessagingItem,
  at: Date,
): string | null {
  const attachments = ev.message?.attachments ?? [];
  if (attachments.length === 0) {
    return null;
  }

  const stored = webhookAttachmentsToStoredAttachments(
    attachments,
    at.toISOString(),
  );
  return serializeAttachmentsJson(stored) ?? JSON.stringify(attachments);
}
