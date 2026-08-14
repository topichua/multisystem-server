import { WishlistAnalyticsService } from "./wishlist-analytics.service";
import { AnalyticsPeriod } from "../types/analytics-period.enum";
import { WishlistUnmetDemandSortBy } from "../dto/analytics-wishlist-query.dto";

describe("WishlistAnalyticsService", () => {
  const context = {
    workspaceId: 7,
    currency: "UAH",
    ranges: {
      current: {
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-14T23:59:59.999Z"),
      },
      previous: {
        from: new Date("2026-07-18T00:00:00.000Z"),
        to: new Date("2026-07-31T23:59:59.999Z"),
      },
      period: AnalyticsPeriod.d30,
    },
  };

  function chain(result: { rawMany?: unknown[]; rawOne?: unknown }) {
    const qb: Record<string, unknown> = {};
    const self = () => qb;
    for (const method of [
      "select",
      "addSelect",
      "innerJoin",
      "leftJoin",
      "where",
      "andWhere",
      "groupBy",
      "addGroupBy",
      "having",
      "orderBy",
      "addOrderBy",
      "offset",
      "limit",
      "setParameter",
      "setParameters",
      "from",
    ]) {
      qb[method] = jest.fn(self);
    }
    qb.clone = jest.fn(() => chain(result));
    qb.expressionMap = { orderBys: {} };
    qb.getQuery = jest.fn(() => "SELECT 1");
    qb.getParameters = jest.fn(() => ({}));
    qb.getRawMany = jest.fn(async () => result.rawMany ?? []);
    qb.getRawOne = jest.fn(async () => result.rawOne ?? null);
    return qb;
  }

  function buildService(opts?: {
    mode?: "summary" | "demand";
    summaryCurrent?: Record<string, number>;
    summaryPrevious?: Record<string, number>;
    demandRows?: Record<string, unknown>[];
    demandTotal?: number;
    salesSummary?: Record<string, number>;
  }) {
    let summaryCalls = 0;
    const demandRawOne = {
      total: opts?.demandTotal ?? (opts?.demandRows?.length ?? 0),
      potential_revenue: opts?.salesSummary?.potentialRevenue ?? 0,
      potential_profit: opts?.salesSummary?.potentialProfit ?? 0,
      sellable_qty: opts?.salesSummary?.sellableQty ?? 0,
      products_count: opts?.salesSummary?.productsCount ?? 0,
    };
    const wishlistRepo = {
      createQueryBuilder: jest.fn(() => {
        if (opts?.mode === "summary") {
          summaryCalls += 1;
          const raw =
            summaryCalls === 1
              ? opts.summaryCurrent
              : opts.summaryPrevious;
          return chain({
            rawOne: {
              requests: raw?.requests ?? 0,
              waiting_products: raw?.waitingProducts ?? 0,
              potential_revenue: raw?.potentialRevenue ?? 0,
              potential_profit: raw?.potentialProfit ?? 0,
            },
          });
        }
        return chain({
          rawMany: opts?.demandRows ?? [],
          rawOne: demandRawOne,
        });
      }),
      manager: {
        createQueryBuilder: jest.fn(() => chain({ rawOne: demandRawOne })),
      },
    };

    const filterBuilder = {
      build: jest.fn(async () => context),
    };

    const service = new WishlistAnalyticsService(
      filterBuilder as never,
      wishlistRepo as never,
    );
    return { service, filterBuilder };
  }

  it("returns summary KPI with previous-period changePercent", async () => {
    const { service } = buildService({
      mode: "summary",
      summaryCurrent: {
        requests: 50,
        waitingProducts: 10,
        potentialRevenue: 2000,
        potentialProfit: 800,
      },
      summaryPrevious: {
        requests: 25,
        waitingProducts: 5,
        potentialRevenue: 1000,
        potentialProfit: 400,
      },
    });

    const result = await service.getSummary(1, { period: AnalyticsPeriod.d30 });
    expect(result.wishlistRequests).toEqual({ value: 50, changePercent: 100 });
    expect(result.waitingProducts).toEqual({ value: 10, changePercent: 100 });
    expect(result.potentialRevenue).toEqual({
      value: 2000,
      changePercent: 100,
    });
    expect(result.potentialProfit).toEqual({ value: 800, changePercent: 100 });
  });

  it("returns 100% change when previous period is zero", async () => {
    const { service } = buildService({
      mode: "summary",
      summaryCurrent: {
        requests: 4,
        waitingProducts: 2,
        potentialRevenue: 100,
        potentialProfit: 0,
      },
      summaryPrevious: {
        requests: 0,
        waitingProducts: 0,
        potentialRevenue: 0,
        potentialProfit: 0,
      },
    });

    const result = await service.getSummary(1, {});
    expect(result.wishlistRequests.changePercent).toBe(100);
    expect(result.potentialProfit).toEqual({ value: 0, changePercent: 0 });
  });

  it("paginates unmet demand and maps variant rows", async () => {
    const { service, filterBuilder } = buildService({
      demandRows: [
        {
          product_id: 10,
          variant_id: 101,
          product_name: "T-Shirt",
          variant_name: "Black / S",
          image_url: null,
          category_name: "Apparel",
          waiting_count: 14,
          available_qty: 0,
          selling_price: 500,
          potential_revenue: 7000,
          potential_profit: 4200,
        },
      ],
      demandTotal: 21,
    });

    const result = await service.getUnmetDemand(1, {
      page: 2,
      limit: 20,
      sortBy: WishlistUnmetDemandSortBy.waitingCount,
    });

    expect(filterBuilder.build).toHaveBeenCalledWith(1, expect.any(Object));
    expect(result.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
      hasNextPage: false,
    });
    expect(result.items[0]).toMatchObject({
      productId: 10,
      variantId: 101,
      waitingCount: 14,
      availableQty: 0,
      potentialRevenue: 7000,
    });
  });

  it("returns potential sales summary independently of the page", async () => {
    const { service } = buildService({
      demandRows: [
        {
          product_id: 10,
          variant_id: 102,
          product_name: "T-Shirt",
          variant_name: "Black / M",
          image_url: null,
          category_name: null,
          waiting_count: 21,
          available_qty: 8,
          sellable_qty: 8,
          selling_price: 500,
          potential_revenue: 4000,
          potential_profit: 2400,
        },
      ],
      demandTotal: 3,
      salesSummary: {
        potentialRevenue: 5650,
        potentialProfit: 2400,
        sellableQty: 23,
        productsCount: 3,
      },
    });

    const result = await service.getPotentialSales(1, { page: 1, limit: 20 });
    expect(result.summary).toEqual({
      potentialRevenue: 5650,
      potentialProfit: 2400,
      sellableQty: 23,
      productsCount: 3,
    });
    expect(result.items[0].sellableQty).toBe(8);
    expect(result.pagination.total).toBe(3);
  });

  it("scopes queries through workspace from the owner filter context", async () => {
    const { service, filterBuilder } = buildService({ mode: "summary" });
    await service.getSummary(99, {});
    expect(filterBuilder.build).toHaveBeenCalledWith(99, {});
  });
});
