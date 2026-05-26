import {
  ProductVariantCustomFieldValue,
  VariantCustomFieldType,
  WorkspaceVariantCustomField,
} from "../database/entities";

export type VariantCustomFieldValueInput = {
  fieldId: number;
  value: string;
};

export type VariantCustomFieldValueDto = {
  fieldId: number;
  key: string;
  label: string;
  type: VariantCustomFieldType;
  value: string | null;
};

export type VariantWithCustomFieldValues = {
  customFieldValues?: ProductVariantCustomFieldValue[];
};

export function customFieldValuesByFieldId(
  variant: VariantWithCustomFieldValues,
): Map<number, string> {
  return new Map(
    (variant.customFieldValues ?? []).map((row) => [row.fieldId, row.value]),
  );
}

export function serializeVariantCustomFields(
  variant: VariantWithCustomFieldValues,
  definitions: WorkspaceVariantCustomField[],
): VariantCustomFieldValueDto[] {
  const byFieldId = customFieldValuesByFieldId(variant);
  return definitions.map((def) => {
    const raw = byFieldId.get(def.id);
    const value =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
    return {
      fieldId: def.id,
      key: def.key,
      label: def.label,
      type: def.type,
      value,
    };
  });
}

export function buildVariantTitleFromFields(
  definitions: WorkspaceVariantCustomField[],
  variant: VariantWithCustomFieldValues,
): string | null {
  const byFieldId = customFieldValuesByFieldId(variant);
  const parts: string[] = [];
  for (const def of definitions) {
    const v = byFieldId.get(def.id)?.trim();
    if (v) {
      parts.push(v);
    }
  }
  if (parts.length > 0) {
    return parts.join(" / ");
  }
  const fallback = [...byFieldId.values()]
    .map((v) => v?.trim())
    .filter(Boolean) as string[];
  return fallback.length > 0 ? fallback.join(" / ") : null;
}

export function buildVariantAttributesSnapshot(
  definitions: WorkspaceVariantCustomField[],
  variant: VariantWithCustomFieldValues,
): Record<string, string> {
  const defById = new Map(definitions.map((d) => [d.id, d.key]));
  const out: Record<string, string> = {};
  for (const row of variant.customFieldValues ?? []) {
    const key = defById.get(row.fieldId);
    const value = row.value?.trim();
    if (key && value) {
      out[key] = value;
    }
  }
  return out;
}

export function resolveVariantCustomFieldValues(
  definitions: WorkspaceVariantCustomField[],
  input: {
    customFields?: VariantCustomFieldValueInput[];
  },
): VariantCustomFieldValueInput[] {
  const defById = new Map(definitions.map((d) => [d.id, d]));
  const out: VariantCustomFieldValueInput[] = [];

  for (const item of input.customFields ?? []) {
    const def = defById.get(item.fieldId);
    if (!def) {
      throw new Error(`Unknown custom field id ${item.fieldId}`);
    }
    const value = item.value?.trim() ?? "";
    if (!value) {
      continue;
    }
    if (value.length > 128) {
      throw new Error(`Custom field "${def.key}" value is too long`);
    }
    if (def.type === VariantCustomFieldType.options) {
      const allowed = (def.options ?? []).map((o) => o.trim());
      if (allowed.length > 0 && !allowed.includes(value)) {
        throw new Error(
          `Custom field "${def.key}" value must be one of: ${allowed.join(", ")}`,
        );
      }
    }
    out.push({ fieldId: def.id, value });
  }

  return out;
}

export function colorSizeSpecToFieldValues(
  definitions: WorkspaceVariantCustomField[],
  spec: { color: string | null; size: string | null },
): VariantCustomFieldValueInput[] {
  const defByKey = new Map(definitions.map((d) => [d.key, d]));
  const out: VariantCustomFieldValueInput[] = [];
  const color = spec.color?.trim();
  const size = spec.size?.trim();
  if (color) {
    const def = defByKey.get("color");
    if (def) {
      out.push({ fieldId: def.id, value: color });
    }
  }
  if (size) {
    const def = defByKey.get("size");
    if (def) {
      out.push({ fieldId: def.id, value: size });
    }
  }
  return out;
}
