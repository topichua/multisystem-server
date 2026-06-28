import {
  BadRequestException,
} from "@nestjs/common";
import { InventoryMovementReason } from "../database/entities/inventory-movement-reason.enum";
import { InventoryMovementType } from "../database/entities/inventory-movement-type.enum";

export type StockState = {
  quantity: number;
  stockCostTotal: number;
  averagePurchasePrice: number | null;
};

export const INVENTORY_REASONS_BY_TYPE: Record<
  InventoryMovementType,
  InventoryMovementReason[]
> = {
  [InventoryMovementType.increase]: [
    InventoryMovementReason.supplierDelivery,
    InventoryMovementReason.customerReturn,
    InventoryMovementReason.errorCorrection,
  ],
  [InventoryMovementType.decrease]: [
    InventoryMovementReason.defect,
    InventoryMovementReason.errorCorrection,
    InventoryMovementReason.orderSale,
  ],
  [InventoryMovementType.set]: [
    InventoryMovementReason.inventory,
    InventoryMovementReason.errorCorrection,
  ],
};

/** Reasons exposed to manual movement UI (excludes system-only `order_sale`). */
export const MANUAL_INVENTORY_REASONS_BY_TYPE: Record<
  InventoryMovementType,
  InventoryMovementReason[]
> = {
  [InventoryMovementType.increase]: INVENTORY_REASONS_BY_TYPE.increase,
  [InventoryMovementType.decrease]: [
    InventoryMovementReason.defect,
    InventoryMovementReason.errorCorrection,
  ],
  [InventoryMovementType.set]: INVENTORY_REASONS_BY_TYPE.set,
};

export function buildInventoryMovementCriteria(): {
  type: InventoryMovementType[];
  reason: InventoryMovementReason[];
  items: Array<{
    type: InventoryMovementType;
    reasons: InventoryMovementReason[];
  }>;
} {
  const items = Object.values(InventoryMovementType).map((type) => ({
    type,
    reasons: [...MANUAL_INVENTORY_REASONS_BY_TYPE[type]],
  }));
  return {
    type: Object.values(InventoryMovementType),
    reason: [...new Set(items.flatMap((item) => item.reasons))],
    items,
  };
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function deriveAveragePurchasePrice(
  stockCostTotal: number,
  quantity: number,
): number | null {
  if (quantity <= 0) {
    return null;
  }
  return roundMoney(stockCostTotal / quantity);
}

export function assertReasonAllowedForType(
  type: InventoryMovementType,
  reason: InventoryMovementReason,
): void {
  if (!INVENTORY_REASONS_BY_TYPE[type].includes(reason)) {
    throw new BadRequestException(
      `Reason "${reason}" is not allowed for movement type "${type}"`,
    );
  }
}

export function resolveIncreasePurchasePrice(
  reason: InventoryMovementReason,
  purchasePrice: number | null | undefined,
  currentAverage: number | null,
): number {
  if (reason === InventoryMovementReason.supplierDelivery) {
    if (purchasePrice == null) {
      throw new BadRequestException(
        "purchasePrice is required for supplier delivery",
      );
    }
    if (purchasePrice < 0) {
      throw new BadRequestException("purchasePrice must be >= 0");
    }
    return purchasePrice;
  }

  if (purchasePrice != null) {
    if (purchasePrice < 0) {
      throw new BadRequestException("purchasePrice must be >= 0");
    }
    return purchasePrice;
  }

  if (reason === InventoryMovementReason.customerReturn) {
    if (currentAverage == null) {
      throw new BadRequestException(
        "purchasePrice is required when current average purchase price is unknown",
      );
    }
    return currentAverage;
  }

  if (currentAverage != null) {
    return currentAverage;
  }

  throw new BadRequestException("purchasePrice is required");
}

export function computeIncreaseStock(
  before: StockState,
  quantity: number,
  purchasePrice: number,
): StockState {
  const newQuantity = before.quantity + quantity;
  const newStockCostTotal = roundMoney(
    before.stockCostTotal + quantity * purchasePrice,
  );
  return {
    quantity: newQuantity,
    stockCostTotal: newStockCostTotal,
    averagePurchasePrice: deriveAveragePurchasePrice(
      newStockCostTotal,
      newQuantity,
    ),
  };
}

export function computeDecreaseStock(
  before: StockState,
  quantity: number,
): StockState {
  const costPerUnit = before.averagePurchasePrice ?? 0;
  const newQuantity = before.quantity - quantity;
  if (newQuantity < 0) {
    throw new BadRequestException("Stock quantity cannot become negative");
  }
  const newStockCostTotal = roundMoney(
    before.stockCostTotal - quantity * costPerUnit,
  );
  return {
    quantity: newQuantity,
    stockCostTotal: newStockCostTotal,
    averagePurchasePrice:
      newQuantity > 0
        ? deriveAveragePurchasePrice(newStockCostTotal, newQuantity)
        : null,
  };
}

export function computeSetStock(
  before: StockState,
  newQuantity: number,
  purchasePrice: number | null | undefined,
): StockState {
  if (newQuantity < 0) {
    throw new BadRequestException("Stock quantity cannot become negative");
  }
  if (newQuantity === 0) {
    return {
      quantity: 0,
      stockCostTotal: 0,
      averagePurchasePrice: null,
    };
  }
  if (newQuantity > before.quantity) {
    const addedQty = newQuantity - before.quantity;
    if (before.quantity === 0) {
      if (purchasePrice == null) {
        throw new BadRequestException(
          "purchasePrice is required when setting stock from zero",
        );
      }
      if (purchasePrice < 0) {
        throw new BadRequestException("purchasePrice must be >= 0");
      }
    }
    const unitPrice =
      purchasePrice ?? before.averagePurchasePrice ?? 0;
    if (before.quantity === 0 && unitPrice === 0 && purchasePrice == null) {
      throw new BadRequestException(
        "purchasePrice is required when setting stock from zero",
      );
    }
    const newStockCostTotal = roundMoney(
      before.stockCostTotal + addedQty * unitPrice,
    );
    return {
      quantity: newQuantity,
      stockCostTotal: newStockCostTotal,
      averagePurchasePrice: deriveAveragePurchasePrice(
        newStockCostTotal,
        newQuantity,
      ),
    };
  }
  if (newQuantity < before.quantity) {
    const removedQty = before.quantity - newQuantity;
    const costPerUnit = before.averagePurchasePrice ?? 0;
    const newStockCostTotal = roundMoney(
      before.stockCostTotal - removedQty * costPerUnit,
    );
    return {
      quantity: newQuantity,
      stockCostTotal: newStockCostTotal,
      averagePurchasePrice: deriveAveragePurchasePrice(
        newStockCostTotal,
        newQuantity,
      ),
    };
  }
  return { ...before };
}
