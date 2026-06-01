import { VariantCustomFieldType } from "../database/entities";
import { VariantCustomFieldApiType } from "./dto/variant-custom-field-api-type.enum";

export type VariantCustomFieldAttributeInput = {
  field: {
    id?: number;
    name?: string;
    type?: VariantCustomFieldApiType;
  };
  value: string;
};

export type ResolvedVariantAttribute = {
  fieldId: number;
  optionId: number | null;
  textValue: string | null;
  /** Denormalized display string (search, list responses). */
  value: string;
};

export function normalizeCustomFieldName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizeCustomFieldOptionValue(value: string): string {
  return value.trim().toLowerCase();
}

export function apiTypeToStorageType(
  type: VariantCustomFieldApiType,
): VariantCustomFieldType {
  return type === VariantCustomFieldApiType.OPTION
    ? VariantCustomFieldType.options
    : VariantCustomFieldType.text;
}
