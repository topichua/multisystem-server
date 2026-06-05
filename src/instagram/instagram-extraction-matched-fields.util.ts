import { VariantCustomFieldType } from "../database/entities/variant-custom-field-type.enum";
import type {
  InstagramPostAiExtractionAttributeDto,
  InstagramPostAiExtractionMatchedFieldDto,
} from "./dto/instagram-post-ai-extraction-response.dto";
import {
  buildExtractionFieldCatalog,
  fieldTypeToApi,
  matchOptionValueForExtraction,
  type ExtractionFieldCatalog,
  type ExtractionFieldCatalogEntry,
} from "./instagram-extraction-catalog.util";
import { resolveWorkspaceFieldForAttribute } from "./instagram-field-name-match.util";

export { buildExtractionFieldCatalog };

type PostAttributeInput = {
  name: string;
  values: string[];
};

export function buildMatchedFieldsFromAttributes(
  attributes: InstagramPostAiExtractionAttributeDto[],
  catalog: ExtractionFieldCatalog,
): InstagramPostAiExtractionMatchedFieldDto[] {
  const usedWorkspaceFieldIds = new Set<number>();
  return attributes.map((attr) =>
    buildMatchedFieldForAttribute(
      { name: attr.name, values: attr.values },
      catalog,
      usedWorkspaceFieldIds,
    ),
  );
}

function buildMatchedFieldForAttribute(
  attribute: PostAttributeInput,
  catalog: ExtractionFieldCatalog,
  usedWorkspaceFieldIds: Set<number>,
): InstagramPostAiExtractionMatchedFieldDto {
  const extractionValues = dedupePostValues(attribute.values);
  const entry = resolveWorkspaceFieldForAttribute(
    attribute.name,
    catalog,
    usedWorkspaceFieldIds,
  );

  const base = { attributeName: attribute.name };

  if (entry && fieldTypeToApi(entry.type) === "option") {
    return {
      ...base,
      id: entry.id,
      type: "option",
      values: extractionValues.map((v) => resolvePostOptionValue(v, entry)),
    };
  }

  if (entry) {
    return {
      ...base,
      id: entry.id,
      type: "text",
      values: extractionValues,
    };
  }

  return {
    ...base,
    name: attribute.name,
    type: "option",
    values: extractionValues.map((v) => ({
      optionName: formatProposedOptionName(v),
    })),
  };
}

function resolvePostOptionValue(
  extractionValue: string,
  entry: ExtractionFieldCatalogEntry,
): { optionId?: number; optionName: string } {
  const trimmed = extractionValue.trim();
  if (!trimmed || entry.type !== VariantCustomFieldType.options) {
    return { optionName: formatProposedOptionName(trimmed) };
  }

  const matched = matchOptionValueForExtraction(trimmed, entry);
  if (matched.optionId != null && entry.optionsById.has(matched.optionId)) {
    const catalogLabel = entry.optionsById.get(matched.optionId);
    return {
      optionId: matched.optionId,
      optionName: catalogLabel ?? trimmed,
    };
  }

  return { optionName: formatProposedOptionName(trimmed) };
}

/** Нова option з extraction (без optionId) — з великої літери. */
function formatProposedOptionName(value: string): string {
  const t = value.trim();
  if (!t) return t;
  if (/^\d+$/.test(t)) return t;
  const [first, ...rest] = [...t];
  return first.toLocaleUpperCase("uk") + rest.join("");
}

function dedupePostValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
