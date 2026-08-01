export const STOCK_SUPPLY_STATUSES = ["pending", "applied"] as const;

export type StockSupplyStatus = (typeof STOCK_SUPPLY_STATUSES)[number];
