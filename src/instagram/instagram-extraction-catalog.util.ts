import { VariantCustomFieldType } from "../database/entities/variant-custom-field-type.enum";
import type { WorkspaceVariantCustomField } from "../database/entities";
import {
  normalizeCustomFieldName,
  normalizeCustomFieldOptionValue,
} from "../variant-custom-fields/variant-custom-fields.resolve.util";

export type ExtractionFieldCatalogEntry = {
  id: number;
  key: string;
  label: string;
  type: VariantCustomFieldType;
  optionsById: Map<number, string>;
  optionsByStrictKey: Map<string, { optionId: number; optionName: string }>;
  optionsByNormalizedKey: Map<string, { optionId: number; optionName: string }>;
};

export type ExtractionFieldCatalog = {
  fieldsById: Map<number, ExtractionFieldCatalogEntry>;
  /** Workspace field `key` (e.g. `color`, `size`). */
  fieldsByKey: Map<string, ExtractionFieldCatalogEntry>;
  fieldIdByNormalizedLabel: Map<string, number>;
  fieldIdByNormalizedKey: Map<string, number>;
};

export function buildExtractionFieldCatalog(
  fields: WorkspaceVariantCustomField[],
): ExtractionFieldCatalog {
  const fieldsById = new Map<number, ExtractionFieldCatalogEntry>();
  const fieldsByKey = new Map<string, ExtractionFieldCatalogEntry>();
  const fieldIdByNormalizedLabel = new Map<string, number>();
  const fieldIdByNormalizedKey = new Map<string, number>();

  for (const field of fields) {
    const optionsById = new Map<number, string>();
    const optionsByStrictKey = new Map<
      string,
      { optionId: number; optionName: string }
    >();
    const optionsByNormalizedKey = new Map<
      string,
      { optionId: number; optionName: string }
    >();

    for (const opt of field.fieldOptions ?? []) {
      optionsById.set(opt.id, opt.label);
      const strict = normalizeCustomFieldOptionValue(opt.label);
      if (strict && !optionsByStrictKey.has(strict)) {
        optionsByStrictKey.set(strict, {
          optionId: opt.id,
          optionName: opt.label,
        });
      }
      const normalized = normalizeOptionValueForFuzzyMatch(opt.label);
      if (normalized && !optionsByNormalizedKey.has(normalized)) {
        optionsByNormalizedKey.set(normalized, {
          optionId: opt.id,
          optionName: opt.label,
        });
      }
    }

    const entry: ExtractionFieldCatalogEntry = {
      id: field.id,
      key: field.key,
      label: field.label,
      type: field.type,
      optionsById,
      optionsByStrictKey,
      optionsByNormalizedKey,
    };
    fieldsById.set(field.id, entry);
    fieldsByKey.set(field.key, entry);

    const labelKey = normalizeCustomFieldName(field.label);
    if (labelKey && !fieldIdByNormalizedLabel.has(labelKey)) {
      fieldIdByNormalizedLabel.set(labelKey, field.id);
    }
    const keyKey = normalizeCustomFieldName(field.key);
    if (keyKey && !fieldIdByNormalizedKey.has(keyKey)) {
      fieldIdByNormalizedKey.set(keyKey, field.id);
    }
  }

  return {
    fieldsById,
    fieldsByKey,
    fieldIdByNormalizedLabel,
    fieldIdByNormalizedKey,
  };
}

export function normalizeOptionValueForFuzzyMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type OptionValueMatchStrictness = "strict" | "semantic";

/** Exact match лише для значень до 3 символів (41, M, XL). */
export function requiresStrictExactOptionMatch(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 3;
}

/** @deprecated Use {@link requiresStrictExactOptionMatch}. */
export function isShortOptionValue(value: string): boolean {
  return requiresStrictExactOptionMatch(value);
}

export function matchOptionValue(
  rawValue: string,
  field: ExtractionFieldCatalogEntry,
): { optionId?: number; optionName: string } {
  return matchOptionValueForExtraction(rawValue, field);
}

/**
 * ≤3 символи — exact; 4+ — normalized + спільний корінь / сенс (без substring на коротких).
 */
export function matchOptionValueForExtraction(
  rawValue: string,
  field: ExtractionFieldCatalogEntry,
): { optionId?: number; optionName: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { optionName: trimmed };
  }

  if (requiresStrictExactOptionMatch(trimmed)) {
    return matchOptionValueStrict(trimmed, field);
  }

  return matchOptionValueSemantic(trimmed, field);
}

/** @deprecated Use {@link matchOptionValueForExtraction}. */
export function matchOptionValueExact(
  rawValue: string,
  field: ExtractionFieldCatalogEntry,
): { optionId?: number; optionName: string } {
  return matchOptionValueForExtraction(rawValue, field);
}

function matchOptionValueStrict(
  trimmed: string,
  field: ExtractionFieldCatalogEntry,
): { optionId?: number; optionName: string } {
  const strictKey = normalizeCustomFieldOptionValue(trimmed);
  const hit = field.optionsByStrictKey.get(strictKey);
  if (hit && isStrictOptionLabelEqual(trimmed, hit.optionName)) {
    return { optionId: hit.optionId, optionName: hit.optionName };
  }
  return { optionName: trimmed };
}

function matchOptionValueSemantic(
  trimmed: string,
  field: ExtractionFieldCatalogEntry,
): { optionId?: number; optionName: string } {
  const inputKey = normalizeOptionValueForFuzzyMatch(trimmed);
  const exact = field.optionsByNormalizedKey.get(inputKey);
  if (exact) {
    return { optionId: exact.optionId, optionName: exact.optionName };
  }

  let best: { optionId: number; optionName: string; score: number } | null = null;

  for (const [, opt] of field.optionsByNormalizedKey) {
    if (!optionValuesShareMeaning(trimmed, opt.optionName)) continue;

    const catalogKey = normalizeOptionValueForFuzzyMatch(opt.optionName);
    const score = meaningMatchScore(inputKey, catalogKey);
    if (!best || score > best.score) {
      best = { optionId: opt.optionId, optionName: opt.optionName, score };
    }
  }

  if (best && best.score >= 0.72) {
    return { optionId: best.optionId, optionName: best.optionName };
  }

  return { optionName: trimmed };
}

function meaningMatchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const prefix = commonPrefixLength(a, b);
  const minLen = Math.min(a.length, b.length);
  const prefixScore = minLen > 0 ? prefix / minLen : 0;

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const editScore = maxLen > 0 ? 1 - dist / maxLen : 0;

  return Math.max(prefixScore, editScore);
}

function optionValuesShareMeaning(input: string, catalogLabel: string): boolean {
  const a = normalizeOptionValueForFuzzyMatch(input);
  const b = normalizeOptionValueForFuzzyMatch(catalogLabel);
  if (!a || !b) return false;
  if (a === b) return true;

  if (areDistinctNumericTokens(a, b)) {
    return false;
  }

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  if (minLen < 4) return false;

  const prefix = commonPrefixLength(a, b);
  if (prefix >= 4 && prefix / minLen >= 0.72) {
    return true;
  }

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4) {
    if (
      longer === shorter ||
      longer.startsWith(`${shorter}-`) ||
      longer.startsWith(`${shorter} `) ||
      longer.endsWith(` ${shorter}`) ||
      longer.endsWith(`-${shorter}`) ||
      longer.includes(` ${shorter} `) ||
      longer.includes(`-${shorter}-`)
    ) {
      return true;
    }
  }

  if (maxLen - minLen <= 1 && levenshtein(a, b) <= 1) {
    return true;
  }
  if (maxLen - minLen <= 2 && minLen >= 5 && levenshtein(a, b) <= 2) {
    return true;
  }

  return false;
}

/** Різні числові токени (5 ≠ 55, 41 ≠ 411). */
function areDistinctNumericTokens(a: string, b: string): boolean {
  return /^\d+$/.test(a) && /^\d+$/.test(b) && a !== b;
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) {
    i++;
  }
  return i;
}

/** Strict: повний збіг label (для цифр — символ у символ). */
function isStrictOptionLabelEqual(input: string, catalogLabel: string): boolean {
  const a = input.trim();
  const b = catalogLabel.trim();
  if (!a || !b) return false;
  if (normalizeCustomFieldOptionValue(a) !== normalizeCustomFieldOptionValue(b)) {
    return false;
  }
  if (/^\d+$/.test(a)) {
    return a === b;
  }
  if (/^[A-Za-z]+$/.test(a) && /^[A-Za-z]+$/.test(b)) {
    return a.toUpperCase() === b.toUpperCase();
  }
  return a.localeCompare(b, "uk", { sensitivity: "accent" }) === 0;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
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

export function fieldTypeToApi(
  type: VariantCustomFieldType,
): "option" | "text" {
  return type === VariantCustomFieldType.options ? "option" : "text";
}
