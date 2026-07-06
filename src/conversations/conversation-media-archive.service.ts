import { Injectable, Logger } from "@nestjs/common";
import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import {
  mapMediaFolderToAttachmentType,
  type StoredMessageAttachment,
} from "./conversation-message-attachments-json.util";
import { CloudflareR2Service } from "../storage/cloudflare-r2.service";

type ArchiveContext = {
  conversationId: number;
  messageExternalId: string;
  messageAt: Date;
};

type MediaFolder = "video" | "audio" | "files";

type InstagramAttachment = Record<string, unknown>;

@Injectable()
export class ConversationMediaArchiveService {
  private readonly log = new Logger(ConversationMediaArchiveService.name);

  constructor(private readonly r2: CloudflareR2Service) {}

  isEnabled(): boolean {
    return this.r2.isConfigured();
  }

  /** Download Instagram Graph CDN assets and store video/audio on R2. */
  async archiveInstagramPayload(
    payload: Record<string, unknown>,
    accessToken: string,
    context: ArchiveContext,
  ): Promise<Record<string, unknown>> {
    if (!this.isEnabled()) {
      return payload;
    }

    const attachments = payload.attachments;
    if (
      !attachments ||
      typeof attachments !== "object" ||
      !("data" in attachments) ||
      !Array.isArray((attachments as { data?: unknown }).data)
    ) {
      return payload;
    }

    const data = (attachments as { data: InstagramAttachment[] }).data;
    let changed = false;
    const nextData: InstagramAttachment[] = [];

    for (const item of data) {
      const archived = await this.archiveInstagramAttachment(
        item,
        accessToken,
        context,
      );
      if (archived !== item) {
        changed = true;
      }
      nextData.push(archived);
    }

    if (!changed) {
      return payload;
    }

    return {
      ...payload,
      attachments: {
        ...(attachments as Record<string, unknown>),
        data: nextData,
      },
    };
  }

  /** Download Telegram media (video / audio / file) and upload to R2. Images use CDN elsewhere. */
  async archiveTelegramMedia(
    client: TelegramClient,
    msg: Api.Message,
    chatId: string,
    context: ArchiveContext,
  ): Promise<{
    displayText: string;
    attachments: { data: Array<Record<string, unknown>> };
    rawExtras: Record<string, unknown>;
    storedAttachments: StoredMessageAttachment[];
  } | null> {
    if (!this.isEnabled() || !msg.id) {
      return null;
    }

    const mediaKind = this.resolveTelegramMediaKind(msg);
    if (!mediaKind) {
      return null;
    }

    const downloaded = await this.downloadTelegramMedia(client, msg);
    if (!downloaded) {
      return null;
    }

    const filename = this.buildTelegramFilename(
      chatId,
      msg.id,
      downloaded.contentType,
      mediaKind,
      msg,
    );
    const key = this.buildObjectKey(context, filename, mediaKind);

    let publicUrl: string;
    try {
      const uploaded = await this.r2.uploadObject({
        key,
        buffer: downloaded.buffer,
        contentType: downloaded.contentType,
      });
      publicUrl = uploaded.publicUrl;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Telegram ${mediaKind} R2 upload failed chat=${chatId} msg=${msg.id}: ${err}`,
      );
      return null;
    }

    const caption = (msg.message ?? "").trim();
    const attachment: Record<string, unknown> = {
      mime_type: downloaded.contentType,
      name: filename,
      file_url: publicUrl,
      r2_url: publicUrl,
      r2_key: key,
    };

    if (mediaKind === "video") {
      attachment.video_data = { url: publicUrl, preview_url: publicUrl };
    }

    const displayByKind: Record<MediaFolder, string> = {
      video: "[Video]",
      audio: "[Audio]",
      files: "[File]",
    };

    const storedAttachments: StoredMessageAttachment[] = [
      {
        type: mapMediaFolderToAttachmentType(mediaKind),
        key,
        url: publicUrl,
        at: context.messageAt.toISOString(),
        name: filename,
      },
    ];

    return {
      displayText: caption || displayByKind[mediaKind],
      attachments: { data: [attachment] },
      rawExtras: {
        mediaType: mediaKind === "files" ? "file" : mediaKind,
        cdnUrl: publicUrl,
        r2Key: key,
      },
      storedAttachments,
    };
  }

  private async archiveInstagramAttachment(
    item: InstagramAttachment,
    accessToken: string,
    context: ArchiveContext,
  ): Promise<InstagramAttachment> {
    if (typeof item.r2_url === "string" && item.r2_url.trim()) {
      return item;
    }

    const mimeType =
      typeof item.mime_type === "string" ? item.mime_type.toLowerCase() : "";
    const videoData =
      item.video_data && typeof item.video_data === "object"
        ? (item.video_data as Record<string, unknown>)
        : null;
    const isVideo = Boolean(videoData?.url) || mimeType.startsWith("video/");
    const isAudio = mimeType.startsWith("audio/");
    const isFile =
      !isVideo &&
      !isAudio &&
      Boolean(
        (typeof item.file_url === "string" && item.file_url.trim()) ||
          mimeType.startsWith("application/"),
      );
    if (!isVideo && !isAudio && !isFile) {
      return item;
    }

    const mediaFolder: MediaFolder = isVideo ? "video" : isAudio ? "audio" : "files";
    const sourceUrl = this.pickInstagramSourceUrl(item, isVideo || isFile);
    if (!sourceUrl) {
      return item;
    }

    const downloaded = await this.downloadUrl(sourceUrl, accessToken);
    if (!downloaded) {
      return item;
    }

    const ext = this.extensionFromContentType(downloaded.contentType, isVideo);
    const filename =
      typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : `instagram-${context.messageExternalId.slice(0, 48)}.${ext}`;
    const key = this.buildObjectKey(context, filename, mediaFolder);

    try {
      const uploaded = await this.r2.uploadObject({
        key,
        buffer: downloaded.buffer,
        contentType: downloaded.contentType,
      });

      const next: InstagramAttachment = {
        ...item,
        file_url: uploaded.publicUrl,
        r2_url: uploaded.publicUrl,
        r2_key: uploaded.key,
        source_url: sourceUrl,
      };

      if (isVideo) {
        const existingVideo =
          videoData && typeof videoData === "object" ? videoData : {};
        next.video_data = {
          ...existingVideo,
          url: uploaded.publicUrl,
          preview_url:
            typeof existingVideo.preview_url === "string" &&
            existingVideo.preview_url.trim()
              ? existingVideo.preview_url
              : uploaded.publicUrl,
          source_url: sourceUrl,
        };
      }

      return next;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Instagram ${mediaFolder} R2 upload failed mid=${context.messageExternalId}: ${err}`,
      );
      return item;
    }
  }

  private pickInstagramSourceUrl(
    item: InstagramAttachment,
    preferVideoData: boolean,
  ): string | null {
    if (preferVideoData) {
      const videoData =
        item.video_data && typeof item.video_data === "object"
          ? (item.video_data as Record<string, unknown>)
          : null;
      const videoUrl =
        typeof videoData?.url === "string" ? videoData.url.trim() : "";
      if (videoUrl) {
        return videoUrl;
      }
    }

    const fileUrl =
      typeof item.file_url === "string" ? item.file_url.trim() : "";
    return fileUrl || null;
  }

  private async downloadUrl(
    assetUrl: string,
    accessToken?: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const u = new URL(assetUrl);
      if (accessToken && !u.searchParams.has("access_token")) {
        u.searchParams.set("access_token", accessToken);
      }
      const res = await fetch(u.toString());
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.log.warn(
          `Media download failed HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
        return null;
      }
      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() ||
        "application/octet-stream";
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) {
        return null;
      }
      return { buffer, contentType };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Media download failed url=${assetUrl.slice(0, 120)}: ${err}`);
      return null;
    }
  }

  private async downloadTelegramMedia(
    client: TelegramClient,
    msg: Api.Message,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const downloaded = await client.downloadMedia(msg, {});
      if (downloaded == null) {
        return null;
      }
      const buffer = Buffer.isBuffer(downloaded)
        ? downloaded
        : Buffer.from(downloaded);
      if (buffer.length === 0) {
        return null;
      }
      const contentType = this.resolveTelegramContentType(msg);
      return { buffer, contentType };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`Telegram media download failed msg=${msg.id}: ${err}`);
      return null;
    }
  }

  private resolveTelegramMediaKind(msg: Api.Message): MediaFolder | null {
    const media = msg.media;
    if (
      media instanceof Api.MessageMediaDocument &&
      media.document instanceof Api.Document
    ) {
      const doc = media.document;
      const mime = doc.mimeType?.toLowerCase() ?? "";
      if (mime.startsWith("video/")) {
        return "video";
      }
      if (mime.startsWith("audio/")) {
        return "audio";
      }
      for (const attr of doc.attributes ?? []) {
        if (attr instanceof Api.DocumentAttributeVideo) {
          return "video";
        }
        if (attr instanceof Api.DocumentAttributeAudio) {
          return "audio";
        }
      }
      if (mime.startsWith("image/")) {
        return null;
      }
      return "files";
    }
    return null;
  }

  private resolveTelegramContentType(msg: Api.Message): string {
    const media = msg.media;
    if (
      media instanceof Api.MessageMediaDocument &&
      media.document instanceof Api.Document
    ) {
      const mime = media.document.mimeType?.trim();
      if (mime) {
        return mime;
      }
    }
    const kind = this.resolveTelegramMediaKind(msg);
    if (kind === "video") {
      return "video/mp4";
    }
    if (kind === "audio") {
      return "audio/ogg";
    }
    if (kind === "files") {
      return "application/octet-stream";
    }
    return "application/octet-stream";
  }

  private buildTelegramFilename(
    chatId: string,
    messageId: number,
    contentType: string,
    kind: MediaFolder,
    msg: Api.Message,
  ): string {
    const media = msg.media;
    if (
      media instanceof Api.MessageMediaDocument &&
      media.document instanceof Api.Document
    ) {
      for (const attr of media.document.attributes ?? []) {
        if (
          attr instanceof Api.DocumentAttributeFilename &&
          attr.fileName?.trim()
        ) {
          return attr.fileName.trim();
        }
      }
    }
    const ext = this.extensionFromContentType(
      contentType,
      kind === "video",
      kind === "files",
    );
    return `telegram-${chatId}-${messageId}.${ext}`;
  }

  private buildObjectKey(
    context: ArchiveContext,
    filename: string,
    mediaFolder: MediaFolder,
  ): string {
    const safeMessageId = context.messageExternalId.replace(/[^a-zA-Z0-9:_-]/g, "_");
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return [
      "conversations",
      String(context.conversationId),
      mediaFolder,
      safeMessageId,
      safeFilename,
    ].join("/");
  }

  private extensionFromContentType(
    contentType: string,
    isVideo: boolean,
    isGenericFile = false,
  ): string {
    const map: Record<string, string> = {
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/opus": "opus",
      "audio/aac": "aac",
      "audio/wav": "wav",
    };
    const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (map[normalized]) {
      return map[normalized];
    }
    if (isVideo) {
      return "mp4";
    }
    if (isGenericFile) {
      return "bin";
    }
    return "mp3";
  }
}
