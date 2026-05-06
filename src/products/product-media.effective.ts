/**
 * Pure helper: variant-level gallery overrides product-level when non-empty.
 * Each input list should already be scoped (e.g. one variant or product-level only).
 */
export function resolveEffectiveMediaOrder<
  T extends { sortOrder: number; id: number },
>(variantMedia: T[], productMedia: T[]): T[] {
  const source = variantMedia.length > 0 ? variantMedia : productMedia;
  return [...source].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id - b.id;
  });
}
