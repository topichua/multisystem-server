import { BadRequestException } from "@nestjs/common";
import { InventoryMode } from "../database/entities/inventory-mode.enum";
import type { VariantStockDto } from "./dto/stock-response.dto";

/** Legacy product API shape (GET /products, catalog, Instagram). */
export type ProductStockFields = {
  quantity: number | null;
  reservedQuantity: number | null;
  availableQuantity: number | null;
};

export function presentProductStockFields(
  stock: VariantStockDto,
): ProductStockFields {
  return {
    quantity: stock.quantity,
    reservedQuantity: 0,
    availableQuantity: stock.quantity,
  };
}

export function assertNoDirectQuantityEdit(
  mode: InventoryMode,
  provided: number | null | undefined,
): void {
  if (provided !== undefined && mode === InventoryMode.advanced) {
    throw new BadRequestException(
      "Direct quantity edits are disabled in advanced inventory mode; use inventory API",
    );
  }
}
