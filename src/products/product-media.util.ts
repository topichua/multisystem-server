import type { ProductMedia } from "../database/entities";

export function mediaSort(a: ProductMedia, b: ProductMedia): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.id - b.id;
}

/** First gallery image by `sortOrder` (then `id`). */
export function pickMainMediaUrl(media: ProductMedia[]): string | null {
  const sorted = [...media].sort(mediaSort);
  return sorted[0]?.url?.trim() || null;
}
