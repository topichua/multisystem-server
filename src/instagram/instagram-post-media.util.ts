import type OpenAI from "openai";
import type { InstagramGraphMediaDetail } from "./instagram.service";

export type InstagramPostMediaItem = {
  mediaId: string;
  url: string;
  type: "image" | "video";
  previewUrl: string;
};

export function extractInstagramPostMedia(
  detail: InstagramGraphMediaDetail,
  postId: string,
): InstagramPostMediaItem[] {
  const rootId = detail.id?.trim() || postId;
  const type = detail.media_type?.toUpperCase() ?? "";

  if (type === "CAROUSEL_ALBUM") {
    const out: InstagramPostMediaItem[] = [];
    for (const child of detail.children?.data ?? []) {
      const childId = child.id?.trim();
      if (!childId) continue;
      const item = mediaItemFromGraphChild(childId, child);
      if (item) out.push(item);
    }
    return out;
  }

  const single = mediaItemFromGraphChild(rootId, {
    media_type: detail.media_type,
    media_url: detail.media_url,
    thumbnail_url: detail.thumbnail_url,
  });
  return single ? [single] : [];
}

export async function buildOpenAiVisionImageParts(
  media: InstagramPostMediaItem[],
  download: (previewUrl: string) => Promise<{ buffer: Buffer; contentType: string }>,
  maxImages = 8,
): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  const seen = new Set<string>();

  for (const item of media) {
    if (parts.length >= maxImages) break;
    const url = item.previewUrl.trim();
    if (!url || seen.has(url)) continue;

    try {
      const { buffer, contentType } = await download(url);
      seen.add(url);
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${contentType};base64,${buffer.toString("base64")}`,
        },
      });
    } catch {
      // skip assets that fail to download
    }
  }

  return parts;
}

function mediaItemFromGraphChild(
  mediaId: string,
  node: {
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
  },
): InstagramPostMediaItem | null {
  const mt = node.media_type?.toUpperCase() ?? "";
  if (mt === "VIDEO") {
    const url = node.media_url?.trim() || node.thumbnail_url?.trim();
    const previewUrl = node.thumbnail_url?.trim() || node.media_url?.trim();
    if (!url || !previewUrl) return null;
    return { mediaId, url, type: "video", previewUrl };
  }
  const url = node.media_url?.trim() || node.thumbnail_url?.trim();
  if (!url) return null;
  return { mediaId, url, type: "image", previewUrl: url };
}
