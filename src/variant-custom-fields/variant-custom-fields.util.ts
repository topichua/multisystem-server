import {
  ProductVariantCustomFieldValue,
  VariantCustomFieldType,
  WorkspaceVariantCustomField,
  WorkspaceVariantCustomFieldOption,
} from "../database/entities";

export type WorkspaceVariantCustomFieldWithOptions = WorkspaceVariantCustomField & {
  fieldOptions?: WorkspaceVariantCustomFieldOption[];
};

export function getFieldOptionLabels(
  def: WorkspaceVariantCustomFieldWithOptions,
): string[] {
  return (def.fieldOptions ?? []).map((o) => o.label);
}

export type VariantCustomFieldValueInput = {
  fieldId: number;
  value: string;
};

export type VariantCustomFieldValueDto = {
  fieldId: number;
  key: string;
  label: string;
  type: VariantCustomFieldType;
  value: string;
  order: number;
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

/** Only custom fields with a non-empty stored value (workspace definition order). */
export function serializeVariantCustomFields(
  variant: VariantWithCustomFieldValues,
  definitions: WorkspaceVariantCustomField[],
): VariantCustomFieldValueDto[] {
  const defById = new Map(definitions.map((d) => [d.id, d]));
  const rows = [...(variant.customFieldValues ?? [])]
    .filter((row) => {
      const def = defById.get(row.fieldId);
      const value = row.value?.trim();
      return Boolean(def && value);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  return rows.map((row) => {
    const def = defById.get(row.fieldId)!;
    return {
      fieldId: def.id,
      key: def.key,
      label: def.label,
      type: def.type,
      value: row.value.trim(),
      order: row.sortOrder,
    };
  });
}

export function buildVariantTitleFromFields(
  definitions: WorkspaceVariantCustomField[],
  variant: VariantWithCustomFieldValues,
): string | null {
  const defById = new Map(definitions.map((d) => [d.id, d]));
  const parts: string[] = [];
  const rows = [...(variant.customFieldValues ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
  for (const row of rows) {
    const v = row.value?.trim();
    if (v && defById.has(row.fieldId)) {
      parts.push(v);
    }
  }
  return parts.length > 0 ? parts.join(" / ") : null;
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
  definitions: WorkspaceVariantCustomFieldWithOptions[],
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
      const allowed = getFieldOptionLabels(def).map((o) => o.trim());
      const normalizedValue = value.toLowerCase();
      const allowedNormalized = allowed.map((o) => o.toLowerCase());
      if (
        allowed.length > 0 &&
        !allowed.includes(value) &&
        !allowedNormalized.includes(normalizedValue)
      ) {
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
