import { BadRequestException } from "@nestjs/common";
import { InventoryMode } from "../database/entities/inventory-mode.enum";

export type StockSnapshot = {
  quantity: number;
  reservedQuantity: number;
  avgPurchasePrice: number | null;
  totalCost: number | null;
  stockInitialized: boolean;
};

export function availableQuantity(stock: StockSnapshot): number {
  return stock.quantity - stock.reservedQuantity;
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function deriveAvgPurchasePrice(
  totalCost: number | null,
  quantity: number,
): number | null {
  if (quantity <= 0 || totalCost == null) {
    return null;
  }
  return roundMoney(totalCost / quantity);
}

export function assertAdvancedMode(mode: InventoryMode): void {
  if (mode !== InventoryMode.advanced) {
    throw new BadRequestException(
      "This operation is only available in advanced inventory mode",
    );
  }
}

export function assertSimpleMode(mode: InventoryMode): void {
  if (mode !== InventoryMode.simple) {
    throw new BadRequestException(
      "This operation is only available in simple inventory mode",
    );
  }
}

export function assertStockInitialized(stock: StockSnapshot): void {
  if (!stock.stockInitialized) {
    throw new BadRequestException(
      "Stock requires initialization before this operation",
    );
  }
}

export function assertNonNegativeQuantity(quantity: number): void {
  if (quantity < 0) {
    throw new BadRequestException("Stock quantity cannot become negative");
  }
}

export function applySimpleQuantitySet(
  before: StockSnapshot,
  newQuantity: number,
): { after: StockSnapshot; quantityChange: number } {
  if (newQuantity < 0) {
    throw new BadRequestException("quantity must be >= 0");
  }
  return {
    quantityChange: newQuantity - before.quantity,
    after: {
      quantity: newQuantity,
      reservedQuantity: before.reservedQuantity,
      avgPurchasePrice: null,
      totalCost: null,
      stockInitialized: false,
    },
  };
}

export function applyInitialStock(
  before: StockSnapshot,
  quantity: number,
  purchasePrice: number,
): { after: StockSnapshot; quantityChange: number; totalCostChange: number } {
  if (before.stockInitialized) {
    throw new BadRequestException("Initial stock was already recorded");
  }
  if (quantity <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  if (purchasePrice < 0) {
    throw new BadRequestException("purchasePrice must be >= 0");
  }
  const totalCost = roundMoney(quantity * purchasePrice);
  return {
    quantityChange: quantity,
    totalCostChange: totalCost,
    after: {
      quantity,
      reservedQuantity: 0,
      avgPurchasePrice: purchasePrice,
      totalCost,
      stockInitialized: true,
    },
  };
}

export function applyPurchase(
  before: StockSnapshot,
  quantity: number,
  purchasePrice: number,
): { after: StockSnapshot; quantityChange: number; totalCostChange: number } {
  if (quantity <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  if (purchasePrice < 0) {
    throw new BadRequestException("purchasePrice must be >= 0");
  }
  if (!before.stockInitialized) {
    throw new BadRequestException(
      "Initial stock must be recorded before purchases",
    );
  }
  const purchaseCost = roundMoney(quantity * purchasePrice);
  const newQuantity = before.quantity + quantity;
  const oldTotalCost = before.totalCost ?? 0;
  const newTotalCost = roundMoney(oldTotalCost + purchaseCost);
  return {
    quantityChange: quantity,
    totalCostChange: purchaseCost,
    after: {
      quantity: newQuantity,
      reservedQuantity: before.reservedQuantity,
      totalCost: newTotalCost,
      avgPurchasePrice: deriveAvgPurchasePrice(newTotalCost, newQuantity),
      stockInitialized: true,
    },
  };
}

export function applyAdvancedQuantityDelta(
  before: StockSnapshot,
  quantityChange: number,
  keepAvgPrice: boolean,
): { after: StockSnapshot; totalCostChange: number | null } {
  const newQuantity = before.quantity + quantityChange;
  assertNonNegativeQuantity(newQuantity);

  if (!keepAvgPrice) {
    return {
      totalCostChange: null,
      after: {
        ...before,
        quantity: newQuantity,
        totalCost:
          before.totalCost == null
            ? null
            : roundMoney((before.avgPurchasePrice ?? 0) * newQuantity),
        avgPurchasePrice: before.avgPurchasePrice,
      },
    };
  }

  const avg = before.avgPurchasePrice ?? 0;
  const totalCostChange = roundMoney(quantityChange * avg);
  const oldTotalCost = before.totalCost ?? 0;
  const newTotalCost = roundMoney(oldTotalCost + totalCostChange);
  return {
    totalCostChange,
    after: {
      quantity: newQuantity,
      reservedQuantity: before.reservedQuantity,
      totalCost: newQuantity > 0 ? newTotalCost : null,
      avgPurchasePrice:
        newQuantity > 0
          ? deriveAvgPurchasePrice(newTotalCost, newQuantity)
          : null,
      stockInitialized: before.stockInitialized,
    },
  };
}

export function applyAdvancedSale(
  before: StockSnapshot,
  soldQty: number,
): { after: StockSnapshot; quantityChange: number; totalCostChange: number } {
  if (soldQty <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  assertStockInitialized(before);
  const quantityChange = -soldQty;
  const { after, totalCostChange } = applyAdvancedQuantityDelta(
    before,
    quantityChange,
    true,
  );
  if (totalCostChange == null) {
    throw new BadRequestException("Cannot compute sale cost change");
  }
  return { after, quantityChange, totalCostChange };
}

export function applySimpleSale(
  before: StockSnapshot,
  soldQty: number,
): { after: StockSnapshot; quantityChange: number } {
  if (soldQty <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  const newQuantity = before.quantity - soldQty;
  assertNonNegativeQuantity(newQuantity);
  return {
    quantityChange: -soldQty,
    after: {
      quantity: newQuantity,
      reservedQuantity: before.reservedQuantity,
      avgPurchasePrice: null,
      totalCost: null,
      stockInitialized: false,
    },
  };
}

export function applyReturn(
  before: StockSnapshot,
  quantity: number,
): {
  after: StockSnapshot;
  quantityChange: number;
  totalCostChange: number | null;
} {
  if (quantity <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  const result = applyAdvancedQuantityDelta(before, quantity, true);
  return {
    after: result.after,
    quantityChange: quantity,
    totalCostChange: result.totalCostChange,
  };
}

export function applyReserve(
  before: StockSnapshot,
  quantity: number,
): { after: StockSnapshot; quantityChange: number } {
  if (quantity <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  if (availableQuantity(before) < quantity) {
    throw new BadRequestException("Insufficient available stock to reserve");
  }
  return {
    quantityChange: quantity,
    after: {
      ...before,
      reservedQuantity: before.reservedQuantity + quantity,
    },
  };
}

export function applyRelease(
  before: StockSnapshot,
  quantity: number,
): { after: StockSnapshot; quantityChange: number } {
  if (quantity <= 0) {
    throw new BadRequestException("quantity must be greater than 0");
  }
  if (before.reservedQuantity < quantity) {
    throw new BadRequestException("Cannot release more than reserved quantity");
  }
  return {
    quantityChange: -quantity,
    after: {
      ...before,
      reservedQuantity: before.reservedQuantity - quantity,
    },
  };
}

export function applyShipFromReservation(
  before: StockSnapshot,
  quantity: number,
  wasReserved: boolean,
): StockSnapshot {
  const reservedQuantity = wasReserved
    ? before.reservedQuantity - quantity
    : before.reservedQuantity;
  if (reservedQuantity < 0) {
    throw new BadRequestException("Reserved quantity cannot become negative");
  }
  return {
    ...before,
    reservedQuantity,
  };
}

export function resetAdvancedStockOnModeSwitch(
  before: StockSnapshot,
): StockSnapshot {
  return {
    quantity: before.quantity,
    reservedQuantity: before.reservedQuantity,
    avgPurchasePrice: null,
    totalCost: null,
    stockInitialized: false,
  };
}
