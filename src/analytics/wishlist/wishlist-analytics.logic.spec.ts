import { calculateChangePercent } from "../utils/analytics-math.util";
import {
  isPotentialSale,
  isUnmetDemand,
  paginationMeta,
  resolvePageLimit,
  sellableQty,
  wishlistKpiPair,
  wishlistPotentialProfit,
  wishlistPotentialRevenue,
} from "./wishlist-analytics.logic";

describe("wishlist analytics logic", () => {
  it("sellableQty is min(waitingCount, availableQty)", () => {
    expect(sellableQty(58, 9)).toBe(9);
    expect(sellableQty(31, 34)).toBe(31);
    expect(sellableQty(12, 12)).toBe(12);
  });

  it("treats no stock as unmet demand with availableQty 0", () => {
    expect(isUnmetDemand(14, 0)).toBe(true);
    expect(isPotentialSale(14, 0)).toBe(false);
  });

  it("includes stock > waiting in potential sales only", () => {
    expect(isPotentialSale(3, 20)).toBe(true);
    expect(isUnmetDemand(3, 20)).toBe(false);
  });

  it("includes stock < waiting in both unmet and potential sales", () => {
    expect(isUnmetDemand(21, 8)).toBe(true);
    expect(isPotentialSale(21, 8)).toBe(true);
    expect(sellableQty(21, 8)).toBe(8);
  });

  it("includes waiting = stock in potential sales, not unmet", () => {
    expect(isUnmetDemand(10, 10)).toBe(false);
    expect(isPotentialSale(10, 10)).toBe(true);
  });

  it("computes potential revenue from qty * selling price", () => {
    expect(wishlistPotentialRevenue(9, 100)).toBe(900);
  });

  it("computes potential profit from qty * (price - cost)", () => {
    expect(wishlistPotentialProfit(9, 100, 40)).toBe(540);
  });

  it("does not invent profit when purchase cost is missing", () => {
    expect(wishlistPotentialProfit(9, 100, null)).toBe(0);
  });

  it("computes changePercent vs previous period", () => {
    expect(calculateChangePercent(30, 20)).toBe(50);
    expect(wishlistKpiPair(30, 20).changePercent).toBe(50);
  });

  it("handles zero previous period", () => {
    expect(calculateChangePercent(0, 0)).toBe(0);
    expect(calculateChangePercent(10, 0)).toBe(100);
  });

  it("paginates 20 items and exposes a second page", () => {
    const first = resolvePageLimit(1, 20);
    const second = resolvePageLimit(2, 20);
    expect(first).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(second).toEqual({ page: 2, limit: 20, offset: 20 });
    const meta = paginationMeta(2, 20, 25);
    expect(meta.totalPages).toBe(2);
    expect(meta.hasNextPage).toBe(false);
    expect(paginationMeta(1, 20, 25).hasNextPage).toBe(true);
  });

  it("caps limit at 100", () => {
    expect(resolvePageLimit(1, 500).limit).toBe(100);
  });
});
