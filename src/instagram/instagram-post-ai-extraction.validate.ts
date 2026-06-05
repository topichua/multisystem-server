import type { WorkspaceVariantCustomField } from "../database/entities";
import { tryParsePriceFromOfferText } from "../products/instagram-analysis-draft.util";
import {
  dedupeStrings,
  expandAttributeValueTokens,
  parseStringArray,
} from "./instagram-extraction-attribute.util";
import { buildExtractionFieldCatalog } from "./instagram-extraction-catalog.util";
import { buildMatchedFieldsFromAttributes } from "./instagram-extraction-matched-fields.util";
import type { InstagramPostMediaItem } from "./instagram-post-media.util";
import type {
  InstagramPostAiExtractionAttributeDto,
  InstagramPostAiExtractionResponseDto,
} from "./dto/instagram-post-ai-extraction-response.dto";

export function emptyInstagramPostAiExtractionFallback(
  sourceInstagramPostId: string,
  media: InstagramPostMediaItem[],
): InstagramPostAiExtractionResponseDto {
  return {
    generatedAt: new Date().toISOString(),
    sourceInstagramPostId,
    media: media.map((m) => ({
      mediaId: m.mediaId,
      url: m.url,
      type: m.type,
    })),
    data: {
      productName: "",
      productDescription: "",
      price: null,
      brandLabel: null,
      matchedCategoryIds: [],
      selectedMediaIds: [],
      attributes: [],
      matchedFields: [],
    },
  };
}

export function validateAndNormalizeInstagramPostAiExtraction(params: {
  sourceInstagramPostId: string;
  media: InstagramPostMediaItem[];
  raw: unknown;
  allowedCategoryIds: Set<string>;
  customFields: WorkspaceVariantCustomField[];
}): InstagramPostAiExtractionResponseDto {
  const fallback = emptyInstagramPostAiExtractionFallback(
    params.sourceInstagramPostId,
    params.media,
  );

  if (!params.raw || typeof params.raw !== "object" || Array.isArray(params.raw)) {
    return fallback;
  }

  const root = params.raw as Record<string, unknown>;
  const allowedMediaIds = new Set(params.media.map((m) => m.mediaId));
  const fieldCatalog = buildExtractionFieldCatalog(params.customFields);

  const productName =
    typeof root.productName === "string" ? root.productName.trim() : "";
  const productDescription =
    typeof root.productDescription === "string"
      ? root.productDescription.trim()
      : "";

  const attributes = normalizeAttributes(root.attributes);
  const matchedFields = buildMatchedFieldsFromAttributes(
    attributes,
    fieldCatalog,
  );

  if (isEmptyExtraction(productName, productDescription, attributes)) {
    return fallback;
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceInstagramPostId: params.sourceInstagramPostId,
    media: fallback.media,
    data: {
      productName,
      productDescription,
      price: normalizePrice(root.price),
      brandLabel: normalizeBrandLabel(root.brandLabel),
      matchedCategoryIds: filterAllowedIds(
        root.matchedCategoryIds,
        params.allowedCategoryIds,
        5,
      ),
      selectedMediaIds: filterAllowedIds(
        root.selectedMediaIds,
        allowedMediaIds,
      ),
      attributes,
      matchedFields,
    },
  };
}

function isEmptyExtraction(
  productName: string,
  productDescription: string,
  attributes: InstagramPostAiExtractionAttributeDto[],
): boolean {
  return !productName && !productDescription && attributes.length === 0;
}

function normalizeAttributes(
  value: unknown,
): InstagramPostAiExtractionAttributeDto[] {
  if (!Array.isArray(value)) return [];

  const out: InstagramPostAiExtractionAttributeDto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;

    const values = expandAttributeValueTokens(parseStringArray(row.values));
    if (values.length === 0) continue;

    out.push({ name, values: dedupeStrings(values) });
  }
  return out;
}

function normalizePrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") {
    return tryParsePriceFromOfferText(value);
  }
  return null;
}

function normalizeBrandLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function filterAllowedIds(
  value: unknown,
  allowed: Set<string>,
  max?: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id =
      typeof item === "number" && Number.isInteger(item)
        ? String(item)
        : typeof item === "string"
          ? item.trim()
          : "";
    if (!id || !allowed.has(id) || out.includes(id)) continue;
    out.push(id);
    if (max != null && out.length >= max) break;
  }
  return out;
}
