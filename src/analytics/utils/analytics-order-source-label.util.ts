const KNOWN_SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  manual: "Manual",
  mobile: "Website",
  marketplace: "Marketplace",
};

export function resolveOrderSourceLabel(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (!normalized) {
    return "Other";
  }
  return KNOWN_SOURCE_LABELS[normalized] ?? humanizeSourceLabel(normalized);
}

function humanizeSourceLabel(source: string): string {
  return source
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
