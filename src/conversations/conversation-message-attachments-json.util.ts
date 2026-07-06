import { ConversationMessageType } from "../database/entities/conversation-message-type.enum";
import type {
  ConversationMessageAttachmentDto,
  ConversationMessageAttachmentType,
} from "./dto/http/conversation-message-attachment.dto";

export type StoredMessageAttachment = {
  type: ConversationMessageAttachmentType;
  key: string;
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

  return { type, key, url, at: atIso, name };
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

export function mapAttachmentsJsonForApi(
  raw: string | null | undefined,
): ConversationMessageAttachmentDto[] | undefined {
  const attachments = parseAttachmentsJson(raw);
  if (attachments.length === 0) {
    return undefined;
  }
  return attachments;
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
