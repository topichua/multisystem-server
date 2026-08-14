import {
  calculateChangePercent,
  roundAnalyticsMoney,
} from "../utils/analytics-math.util";

export type WishlistKpiPair = {
  value: number;
  changePercent: number;
};

export function wishlistKpiPair(current: number, previous: number): WishlistKpiPair {
  return {
    value: current,
    changePercent: calculateChangePercent(current, previous),
  };
}

export function sellableQty(waitingCount: number, availableQty: number): number {
  return Math.min(waitingCount, availableQty);
}

export function wishlistPotentialRevenue(
  qty: number,
  sellingPrice: number,
): number {
  return roundAnalyticsMoney(qty * sellingPrice);
}

/** Missing purchase cost contributes 0 — do not invent a cost. */
export function wishlistPotentialProfit(
  qty: number,
  sellingPrice: number,
  purchasePrice: number | null,
): number {
  if (purchasePrice == null) {
    return 0;
  }
  return roundAnalyticsMoney(qty * (sellingPrice - purchasePrice));
}

export function isUnmetDemand(
  waitingCount: number,
  availableQty: number,
): boolean {
  return waitingCount > 0 && waitingCount > availableQty;
}

export function isPotentialSale(
  waitingCount: number,
  availableQty: number,
): boolean {
  return waitingCount > 0 && availableQty > 0 && sellableQty(waitingCount, availableQty) > 0;
}

export function paginationMeta(
  page: number,
  limit: number,
  total: number,
): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
} {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
  };
}

export const WISHLIST_ANALYTICS_DEFAULT_PAGE = 1;
export const WISHLIST_ANALYTICS_DEFAULT_LIMIT = 20;
export const WISHLIST_ANALYTICS_MAX_LIMIT = 100;

export function resolvePageLimit(
  page?: number,
  limit?: number,
): { page: number; limit: number; offset: number } {
  const safePage = Math.max(page ?? WISHLIST_ANALYTICS_DEFAULT_PAGE, 1);
  const safeLimit = Math.min(
    Math.max(limit ?? WISHLIST_ANALYTICS_DEFAULT_LIMIT, 1),
    WISHLIST_ANALYTICS_MAX_LIMIT,
  );
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}
