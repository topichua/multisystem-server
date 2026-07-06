import { ConversationMessageType } from "../database/entities/conversation-message-type.enum";
import type {
  ConversationMessageAttachmentDto,
  ConversationMessageAttachmentType,
  ConversationMessageAttachmentsDto,
} from "./dto/http/conversation-message-attachment.dto";

export type StoredMessageAttachment = {
  type: ConversationMessageAttachmentType;
  key: string;
  r2_key?: string;
  url: string;
  at: string;
  name: string;
};

function normalizeStoredAttachment(item: unknown): StoredMessageAttachment | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const raw = item as Record<string, unknown>;
  const type = raw.type;
  if (type !== "image" && type !== "video" && type !== "audio" && type !== "file") {
    return null;
  }
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!key || !url || !name) {
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

  const r2Key =
    typeof raw.r2_key === "string" && raw.r2_key.trim()
      ? raw.r2_key.trim()
      : type === "image"
        ? undefined
        : key;
  return {
    type,
    key,
    ...(r2Key ? { r2_key: r2Key } : {}),
    url,
    at: atIso,
    name,
  };
}

export function parseAttachmentsJson(
  raw: string | null | undefined,
): StoredMessageAttachment[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeStoredAttachment(item))
      .filter((item): item is StoredMessageAttachment => item != null);
  } catch {
    return [];
  }
}

export function serializeAttachmentsJson(
  attachments: StoredMessageAttachment[],
): string | null {
  if (attachments.length === 0) {
    return null;
  }
  return JSON.stringify(attachments);
}

function mapAttachmentItemsForApi(
  attachments: StoredMessageAttachment[],
): ConversationMessageAttachmentDto[] {
  return attachments.map((item) => ({
    type: item.type,
    key: item.key,
    url: item.url,
    at: item.at,
    name: item.name,
    ...(item.r2_key ? { r2_key: item.r2_key } : {}),
  }));
}

function wrapAttachmentsForApi(
  items: ConversationMessageAttachmentDto[],
): ConversationMessageAttachmentsDto | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return { data: items };
}

export function mapAttachmentsJsonForApi(
  raw: string | null | undefined,
): ConversationMessageAttachmentsDto | undefined {
  const attachments = parseAttachmentsJson(raw);
  return wrapAttachmentsForApi(mapAttachmentItemsForApi(attachments));
}

/** Best-effort legacy `instagram_json.attachments.data` → unified attachments shape. */
export function mapInstagramStoredAttachmentsForApi(
  row: { attachmentJson: string | null; createdAt: Date; systemUpdatedAt: Date | null },
  stored: { data?: Array<Record<string, unknown>> } | undefined,
): ConversationMessageAttachmentsDto | undefined {
  const fromColumn = mapAttachmentsJsonForApi(row.attachmentJson);
  if (fromColumn != null) {
    return fromColumn;
  }

  const data = stored?.data ?? [];
  if (data.length === 0) {
    return undefined;
  }

  const fallbackAt =
    row.systemUpdatedAt?.toISOString() ?? row.createdAt.toISOString();
  const out: ConversationMessageAttachmentDto[] = [];

  for (const item of data) {
    const r2Key =
      typeof item.r2_key === "string" ? item.r2_key.trim() : "";
    const url =
      (typeof item.r2_url === "string" ? item.r2_url.trim() : "") ||
      (typeof item.file_url === "string" ? item.file_url.trim() : "") ||
      (typeof item.url === "string" ? item.url.trim() : "");
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : "attachment";
    const mime =
      typeof item.mime_type === "string" ? item.mime_type.toLowerCase() : "";
    const type = resolveAttachmentTypeFromLegacyItem(item, mime);
    const key =
      r2Key ||
      (typeof item.key === "string" ? item.key.trim() : "") ||
      url;
    if (!key || !url) {
      continue;
    }
    out.push({
      type,
      key,
      url,
      at: fallbackAt,
      name,
      ...(r2Key
        ? { r2_key: r2Key }
        : type !== "image"
          ? { r2_key: key }
          : {}),
    });
  }

  return wrapAttachmentsForApi(out);
}

function resolveAttachmentTypeFromLegacyItem(
  item: Record<string, unknown>,
  mime: string,
): ConversationMessageAttachmentType {
  if (item.video_data != null || mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (item.image_data != null || mime.startsWith("image/")) {
    return "image";
  }
  return "file";
}

export function resolveMessageTypeFromAttachments(
  attachments: StoredMessageAttachment[],
): ConversationMessageType {
  const first = attachments[0]?.type;
  switch (first) {
    case "image":
      return ConversationMessageType.image;
    case "video":
      return ConversationMessageType.video;
    case "audio":
      return ConversationMessageType.audio;
    case "file":
      return ConversationMessageType.file;
    default:
      return ConversationMessageType.text;
  }
}

export function mapMediaFolderToAttachmentType(
  folder: "image" | "video" | "audio" | "files",
): ConversationMessageAttachmentType {
  if (folder === "files") {
    return "file";
  }
  return folder;
}
