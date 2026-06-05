const LETTER_SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "2XL",
  "3XL",
] as const;

const MAX_NUMERIC_RANGE_SPAN = 40;

/** Розгортає однозначний діапазон або повертає [value]. */
export function expandValueRangeToken(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const numeric = tryExpandNumericRange(trimmed);
  if (numeric) return numeric;

  const letter = tryExpandLetterRange(trimmed);
  if (letter) return letter;

  return [trimmed];
}

export function sortComparableValueLabels(labels: string[]): string[] {
  return [...labels].sort(compareValueLabels);
}

export function normalizeValueKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tryExpandNumericRange(value: string): string[] | null {
  const m = value.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
  if (!m) return null;

  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }
  if (end - start > MAX_NUMERIC_RANGE_SPAN) return null;

  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    out.push(String(n));
  }
  return out;
}

function tryExpandLetterRange(value: string): string[] | null {
  const m = value.match(/^([A-Za-z]{1,4})\s*[-–—]\s*([A-Za-z]{1,4})$/);
  if (!m) return null;

  const startIdx = letterSizeIndex(normalizeLetterSize(m[1]));
  const endIdx = letterSizeIndex(normalizeLetterSize(m[2]));
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx || endIdx - startIdx > 10) {
    return null;
  }

  return LETTER_SIZE_ORDER.slice(startIdx, endIdx + 1) as unknown as string[];
}

function normalizeLetterSize(s: string): string {
  const u = s.trim().toUpperCase();
  if (u === "2XL") return "2XL";
  if (u === "3XL") return "3XL";
  return u;
}

function letterSizeIndex(label: string): number {
  return LETTER_SIZE_ORDER.indexOf(
    label as (typeof LETTER_SIZE_ORDER)[number],
  );
}

function compareValueLabels(a: string, b: string): number {
  const aNum = /^\d+$/.test(a) ? Number.parseInt(a, 10) : NaN;
  const bNum = /^\d+$/.test(b) ? Number.parseInt(b, 10) : NaN;
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }

  const aIdx = letterSizeIndex(normalizeLetterSize(a));
  const bIdx = letterSizeIndex(normalizeLetterSize(b));
  if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;

  return a.localeCompare(b, "uk");
}
