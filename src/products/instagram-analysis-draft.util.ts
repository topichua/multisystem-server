/** Shared helpers for Instagram vision analysis → draft product shape. */

export function expandVariantColorSize(
  colors: string[],
  sizes: string[],
): Array<{ color: string | null; size: string | null }> {
  const colorVals: (string | null)[] = colors.length > 0 ? colors : [null];
  const sizeVals: (string | null)[] = sizes.length > 0 ? sizes : [null];
  const out: Array<{ color: string | null; size: string | null }> = [];
  for (const color of colorVals) {
    for (const size of sizeVals) {
      out.push({ color, size });
    }
  }
  return out;
}

export function mergeAnalysisDescription(
  shortDesc: string,
  longDesc: string,
): string | null {
  const s = shortDesc.trim();
  const l = longDesc.trim();
  if (!s && !l) {
    return null;
  }
  if (!s) {
    return l;
  }
  if (!l || s === l) {
    return s;
  }
  return `${s}\n\n${l}`;
}

export function tryParsePriceFromOfferText(text: string | null): number | null {
  if (!text?.trim()) {
    return null;
  }
  const normalized = text.replace(/\u00a0/g, " ").trim();
  const m = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!m?.[1]) {
    return null;
  }
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}
