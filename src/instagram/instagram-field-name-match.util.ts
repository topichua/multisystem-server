import { normalizeCustomFieldName } from "../variant-custom-fields/variant-custom-fields.resolve.util";
import { normalizeOptionValueForFuzzyMatch } from "./instagram-extraction-catalog.util";
import type {
  ExtractionFieldCatalog,
  ExtractionFieldCatalogEntry,
} from "./instagram-extraction-catalog.util";

const FIELD_MATCH_MIN_SCORE = 0.68;

/** Українська ↔ англійська назви variant-полів. */
const ATTRIBUTE_FIELD_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["колір", "color", "colour", "колор"],
  ["розмір", "size", "razmer", "размер"],
  ["матеріал", "material"],
  ["стать", "gender"],
];

export function expandAttributeNameTokens(attributeName: string): Set<string> {
  const normalized = normalizeCustomFieldName(attributeName);
  const tokens = new Set<string>();
  if (!normalized) return tokens;

  tokens.add(normalized);
  tokens.add(normalizeOptionValueForFuzzyMatch(attributeName));

  for (const group of ATTRIBUTE_FIELD_ALIAS_GROUPS) {
    const normalizedGroup = group.map((g) => normalizeCustomFieldName(g));
    if (normalizedGroup.includes(normalized)) {
      for (const g of normalizedGroup) {
        tokens.add(g);
        tokens.add(normalizeOptionValueForFuzzyMatch(g));
      }
    }
  }

  return tokens;
}

function fieldNameForms(field: ExtractionFieldCatalogEntry): string[] {
  return [
    normalizeCustomFieldName(field.label),
    normalizeCustomFieldName(field.key),
    normalizeOptionValueForFuzzyMatch(field.label),
    normalizeOptionValueForFuzzyMatch(field.key),
  ].filter(Boolean);
}

/** 0..1: alias, нормалізований збіг, префікс/корінь, невелика відстань Levenshtein. */
export function fieldNameMatchScore(
  attributeName: string,
  field: ExtractionFieldCatalogEntry,
): number {
  const attrTokens = expandAttributeNameTokens(attributeName);
  if (attrTokens.size === 0) return 0;

  for (const form of fieldNameForms(field)) {
    if (attrTokens.has(form)) return 1;
  }

  const attrPrimary =
    normalizeOptionValueForFuzzyMatch(attributeName) ||
    normalizeCustomFieldName(attributeName);
  if (!attrPrimary) return 0;

  let best = 0;
  for (const form of fieldNameForms(field)) {
    best = Math.max(best, fuzzyNameSimilarity(attrPrimary, form));
  }
  return best;
}

function fuzzyNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);

  if (minLen <= 3) {
    return a === b ? 1 : 0;
  }

  const prefix = commonPrefixLength(a, b);
  const prefixScore = prefix >= 3 ? prefix / minLen : 0;

  const dist = levenshtein(a, b);
  const editScore =
    maxLen > 0 && dist <= 2 ? Math.max(0, 1 - dist / maxLen) : 0;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  let containScore = 0;
  if (shorter.length >= 4 && longer.includes(shorter)) {
    containScore = shorter.length / longer.length;
  }

  return Math.max(prefixScore, editScore, containScore);
}

export function attributeNameMatchesWorkspaceField(
  attributeName: string,
  field: ExtractionFieldCatalogEntry,
): boolean {
  return fieldNameMatchScore(attributeName, field) >= FIELD_MATCH_MIN_SCORE;
}

/**
 * Найкращий workspace field за схожістю імені (без повторного використання).
 */
export function resolveWorkspaceFieldForAttribute(
  attributeName: string,
  catalog: ExtractionFieldCatalog,
  usedFieldIds: Set<number>,
): ExtractionFieldCatalogEntry | null {
  let best: { field: ExtractionFieldCatalogEntry; score: number } | null = null;

  for (const field of catalog.fieldsById.values()) {
    if (usedFieldIds.has(field.id)) continue;

    const score = fieldNameMatchScore(attributeName, field);
    if (score < FIELD_MATCH_MIN_SCORE) continue;
    if (!best || score > best.score) {
      best = { field, score };
    }
  }

  if (!best) return null;

  usedFieldIds.add(best.field.id);
  return best.field;
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) {
    i++;
  }
  return i;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}
