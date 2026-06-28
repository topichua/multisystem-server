import { BadRequestException } from "@nestjs/common";
import { InventoryMode } from "../database/entities/inventory-mode.enum";

export function exposesQuantity(mode: InventoryMode): boolean {
  return mode === InventoryMode.simple || mode === InventoryMode.advanced;
}

export function allowsDirectQuantityEdit(mode: InventoryMode): boolean {
  return mode === InventoryMode.simple;
}

export function allowsInventoryMovements(mode: InventoryMode): boolean {
  return mode === InventoryMode.advanced;
}

export function managesStockOnOrders(mode: InventoryMode): boolean {
  return mode === InventoryMode.simple || mode === InventoryMode.advanced;
}

export function presentQuantity(
  mode: InventoryMode,
  quantity: number | null | undefined,
): number | null {
  if (!exposesQuantity(mode)) {
    return null;
  }
  return quantity ?? null;
}

export function assertDirectQuantityEditAllowed(mode: InventoryMode): void {
  if (mode === InventoryMode.off) {
    throw new BadRequestException(
      "Quantity is disabled when workspace inventory mode is off",
    );
  }
  if (mode === InventoryMode.advanced) {
    throw new BadRequestException(
      "Direct quantity edits are disabled in advanced inventory mode; use inventory movements",
    );
  }
}

export function assertInventoryMovementsAllowed(mode: InventoryMode): void {
  if (!allowsInventoryMovements(mode)) {
    throw new BadRequestException(
      "Inventory movements are only available when workspace inventory mode is advanced",
    );
  }
}

export function quantityForCreate(
  mode: InventoryMode,
  provided: number | null | undefined,
): number | null {
  if (provided !== undefined) {
    assertDirectQuantityEditAllowed(mode);
  }
  if (mode === InventoryMode.simple) {
    return provided ?? null;
  }
  return null;
}
