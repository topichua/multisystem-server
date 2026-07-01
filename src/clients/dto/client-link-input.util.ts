export function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    if (item == null) continue;
    const s = typeof item === "string" ? item.trim() : String(item).trim();
    if (s.length > 0) {
      out.push(s);
    }
  }
  return out;
}

export function appendSingularToArray(
  array: string[] | undefined,
  singular: string | null | undefined,
): string[] | undefined {
  if (singular === undefined) {
    return array;
  }
  if (singular === null) {
    return array ?? [];
  }
  const s = String(singular).trim();
  const base = array ?? [];
  if (!s) {
    return base;
  }
  return [...base, s];
}

export type ClientSocialIds = {
  instagramUserIds: string[];
  telegramUserIds: string[];
};
