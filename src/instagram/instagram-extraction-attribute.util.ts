import {
  expandValueRangeToken,
  normalizeValueKey,
  sortComparableValueLabels,
} from "./instagram-extraction-value-range.util";

export function expandAttributeValueTokens(values: string[]): string[] {
  const expanded: string[] = [];
  for (const token of values) {
    expanded.push(
      ...expandValueRangeToken(token).map((p) => p.trim()).filter(Boolean),
    );
  }
  return dedupeExpandedValues(expanded);
}

function dedupeExpandedValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = normalizeValueKey(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  if (shouldSortValues(out)) {
    return sortComparableValueLabels(out);
  }
  return out;
}

function shouldSortValues(values: string[]): boolean {
  if (values.length === 0) return false;
  return values.every((v) => /^\d{1,3}$/.test(v) || /^[A-Za-z]{1,4}$/.test(v));
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (t) out.push(t);
  }
  return out;
}
