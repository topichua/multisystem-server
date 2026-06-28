import { InventoryMode } from "../database/entities/inventory-mode.enum";
import { exposesQuantity } from "./inventory-mode.util";

export function variantPhysicalQuantity(variant: {
  quantity: number | null;
}): number {
  return variant.quantity ?? 0;
}

export function variantReservedQuantity(variant: {
  reservedQuantity?: number;
}): number {
  return variant.reservedQuantity ?? 0;
}

export function computeAvailableQuantity(variant: {
  quantity: number | null;
  reservedQuantity?: number;
}): number {
  return (
    variantPhysicalQuantity(variant) - variantReservedQuantity(variant)
  );
}

export type VariantInventoryQuantities = {
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
};

export function toVariantInventoryQuantities(variant: {
  quantity: number | null;
  reservedQuantity?: number;
}): VariantInventoryQuantities {
  const quantity = variantPhysicalQuantity(variant);
  const reservedQuantity = variantReservedQuantity(variant);
  return {
    quantity,
    reservedQuantity,
    availableQuantity: quantity - reservedQuantity,
  };
}

export function presentInventoryQuantities(
  mode: InventoryMode,
  variant: { quantity: number | null; reservedQuantity?: number },
): {
  quantity: number | null;
  reservedQuantity: number | null;
  availableQuantity: number | null;
} {
  if (!exposesQuantity(mode)) {
    return {
      quantity: null,
      reservedQuantity: null,
      availableQuantity: null,
    };
  }
  const values = toVariantInventoryQuantities(variant);
  return {
    quantity: values.quantity,
    reservedQuantity: values.reservedQuantity,
    availableQuantity: values.availableQuantity,
  };
}
