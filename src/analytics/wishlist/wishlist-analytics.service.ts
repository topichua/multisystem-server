import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { ClientWishlistItem } from "../../database/entities";
import { ProductMediaType } from "../../database/entities/product-media-type.enum";
import { AnalyticsFilterBuilder } from "../filters/analytics-filter.builder";
import type { AnalyticsQueryDto } from "../dto/analytics-query.dto";
import {
  AnalyticsWishlistPotentialSalesQueryDto,
  AnalyticsWishlistUnmetDemandQueryDto,
  WishlistAnalyticsSortDirection,
  WishlistPotentialSalesSortBy,
  WishlistUnmetDemandSortBy,
} from "../dto/analytics-wishlist-query.dto";
import type {
  AnalyticsWishlistPotentialSalesResponseDto,
  AnalyticsWishlistSummaryResponseDto,
  AnalyticsWishlistUnmetDemandResponseDto,
} from "../dto/analytics-wishlist-response.dto";
import type { AnalyticsDateRange } from "../types/analytics-date-range.types";
import { roundAnalyticsMoney } from "../utils/analytics-math.util";
import {
  paginationMeta,
  resolvePageLimit,
  wishlistKpiPair,
} from "./wishlist-analytics.logic";

const SELLING_PRICE_SQL = `COALESCE(v.price, p.price, 0)`;
const AVAILABLE_QTY_SQL = `GREATEST(COALESCE(vs.quantity, 0) - COALESCE(vs.reserved_quantity, 0), 0)`;
const WAITING_COUNT_SQL = `COUNT(*)::int`;
const IMAGE_URL_SQL = `(
  SELECT pm.url
  FROM product_media pm
  WHERE pm.product_id = p.id
    AND pm.type = '${ProductMediaType.image}'
    AND (pm.variant_id = w.variant_id OR pm.variant_id IS NULL)
  ORDER BY CASE WHEN pm.variant_id IS NOT NULL THEN 0 ELSE 1 END,
           pm.sort_order ASC,
           pm.id ASC
  LIMIT 1
)`;
const VARIANT_NAME_SQL = `(
  SELECT string_agg(cfv.value, ' / ' ORDER BY cfv.sort_order ASC, cfv.id ASC)
  FROM product_variant_custom_field_value cfv
  WHERE cfv.variant_id = w.variant_id
    AND btrim(cfv.value) <> ''
)`;

type DemandRowRaw = {
  product_id: string | number;
  variant_id: string | number | null;
  product_name: string;
  variant_name: string | null;
  image_url: string | null;
  category_name: string | null;
  waiting_count: string | number;
  available_qty: string | number;
  selling_price: string | number;
  potential_revenue: string | number;
  potential_profit: string | number;
  sellable_qty?: string | number;
};

type SummaryRaw = {
  requests: string | number;
  waiting_products: string | number;
  potential_revenue: string | number;
  potential_profit: string | number;
};

@Injectable()
export class WishlistAnalyticsService {
  constructor(
    private readonly filterBuilder: AnalyticsFilterBuilder,
    @InjectRepository(ClientWishlistItem)
    private readonly wishlistRepo: Repository<ClientWishlistItem>,
  ) {}

  async getSummary(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsWishlistSummaryResponseDto> {
    const context = await this.filterBuilder.build(ownerId, query);
    const [current, previous] = await Promise.all([
      this.loadSummary(context.workspaceId, context.currency, context.ranges.current),
      this.loadSummary(context.workspaceId, context.currency, context.ranges.previous),
    ]);

    return {
      wishlistRequests: wishlistKpiPair(current.requests, previous.requests),
      waitingProducts: wishlistKpiPair(
        current.waitingProducts,
        previous.waitingProducts,
      ),
      potentialRevenue: wishlistKpiPair(
        current.potentialRevenue,
        previous.potentialRevenue,
      ),
      potentialProfit: wishlistKpiPair(
        current.potentialProfit,
        previous.potentialProfit,
      ),
    };
  }

  async getUnmetDemand(
    ownerId: number,
    query: AnalyticsWishlistUnmetDemandQueryDto,
  ): Promise<AnalyticsWishlistUnmetDemandResponseDto> {
    const context = await this.filterBuilder.build(ownerId, query);
    const { page, limit, offset } = resolvePageLimit(query.page, query.limit);
    const sortBy = query.sortBy ?? WishlistUnmetDemandSortBy.waitingCount;
    const direction =
      query.sortDirection ?? WishlistAnalyticsSortDirection.desc;

    const qb = this.baseDemandQuery(context.workspaceId, context.currency);
    qb.addSelect(WAITING_COUNT_SQL, "waiting_count")
      .addSelect(AVAILABLE_QTY_SQL, "available_qty")
      .addSelect(
        `${WAITING_COUNT_SQL} * ${SELLING_PRICE_SQL}`,
        "potential_revenue",
      )
      .addSelect(this.profitSql(WAITING_COUNT_SQL), "potential_profit")
      .having(`${WAITING_COUNT_SQL} > ${AVAILABLE_QTY_SQL}`);

    this.orderDemand(qb, sortBy, direction);
    qb.addOrderBy("w.product_id", "ASC").addOrderBy("w.variant_id", "ASC");

    const total = await this.countGrouped(qb);
    const rows = await qb.offset(offset).limit(limit).getRawMany<DemandRowRaw>();

    return {
      items: rows.map((row) => this.mapDemandItem(row)),
      pagination: paginationMeta(page, limit, total),
    };
  }

  async getPotentialSales(
    ownerId: number,
    query: AnalyticsWishlistPotentialSalesQueryDto,
  ): Promise<AnalyticsWishlistPotentialSalesResponseDto> {
    const context = await this.filterBuilder.build(ownerId, query);
    const { page, limit, offset } = resolvePageLimit(query.page, query.limit);
    const sortBy =
      query.sortBy ?? WishlistPotentialSalesSortBy.potentialRevenue;
    const direction =
      query.sortDirection ?? WishlistAnalyticsSortDirection.desc;

    const sellableSql = `LEAST(${WAITING_COUNT_SQL}, ${AVAILABLE_QTY_SQL})`;

    const qb = this.baseDemandQuery(context.workspaceId, context.currency);
    qb.addSelect(WAITING_COUNT_SQL, "waiting_count")
      .addSelect(AVAILABLE_QTY_SQL, "available_qty")
      .addSelect(sellableSql, "sellable_qty")
      .addSelect(`${sellableSql} * ${SELLING_PRICE_SQL}`, "potential_revenue")
      .addSelect(this.profitSql(sellableSql), "potential_profit")
      .having(`${WAITING_COUNT_SQL} > 0 AND ${AVAILABLE_QTY_SQL} > 0`);

    const summaryRaw = await this.loadPotentialSalesSummary(qb.clone());

    this.orderDemand(qb, sortBy, direction);
    qb.addOrderBy("w.product_id", "ASC").addOrderBy("w.variant_id", "ASC");

    const total = await this.countGrouped(qb);
    const rows = await qb.offset(offset).limit(limit).getRawMany<DemandRowRaw>();

    return {
      summary: {
        potentialRevenue: roundAnalyticsMoney(summaryRaw.potentialRevenue),
        potentialProfit: roundAnalyticsMoney(summaryRaw.potentialProfit),
        sellableQty: summaryRaw.sellableQty,
        productsCount: summaryRaw.productsCount,
      },
      items: rows.map((row) => ({
        ...this.mapDemandItem(row),
        sellableQty: Number(row.sellable_qty ?? 0),
      })),
      pagination: paginationMeta(page, limit, total),
    };
  }

  private profitSql(qtySql: string): string {
    return `CASE
      WHEN vs.avg_purchase_price IS NULL THEN 0
      ELSE ${qtySql} * (${SELLING_PRICE_SQL} - vs.avg_purchase_price)
    END`;
  }

  private baseDemandQuery(
    workspaceId: number,
    currency: string,
  ): SelectQueryBuilder<ClientWishlistItem> {
    return this.wishlistRepo
      .createQueryBuilder("w")
      .innerJoin("w.product", "p")
      .innerJoin("w.variant", "v")
      .leftJoin(
        "variant_stocks",
        "vs",
        "vs.variant_id = w.variant_id AND vs.workspace_id = w.workspace_id",
      )
      .leftJoin("p.category", "c")
      .select("w.product_id", "product_id")
      .addSelect("w.variant_id", "variant_id")
      .addSelect("p.name", "product_name")
      .addSelect(VARIANT_NAME_SQL, "variant_name")
      .addSelect(IMAGE_URL_SQL, "image_url")
      .addSelect("c.name", "category_name")
      .addSelect(SELLING_PRICE_SQL, "selling_price")
      .where("w.workspace_id = :workspaceId", { workspaceId })
      .andWhere("p.currency = :currency", { currency })
      .groupBy("w.product_id")
      .addGroupBy("w.variant_id")
      .addGroupBy("p.name")
      .addGroupBy("c.name")
      .addGroupBy("v.price")
      .addGroupBy("p.price")
      .addGroupBy("vs.quantity")
      .addGroupBy("vs.reserved_quantity")
      .addGroupBy("vs.avg_purchase_price");
  }

  private orderDemand(
    qb: SelectQueryBuilder<ClientWishlistItem>,
    sortBy: string,
    direction: WishlistAnalyticsSortDirection,
  ): void {
    const dir = direction === WishlistAnalyticsSortDirection.asc ? "ASC" : "DESC";
    const column =
      sortBy === WishlistUnmetDemandSortBy.waitingCount
        ? "waiting_count"
        : sortBy === WishlistPotentialSalesSortBy.sellableQty
          ? "sellable_qty"
          : sortBy === WishlistUnmetDemandSortBy.potentialProfit
            ? "potential_profit"
            : "potential_revenue";
    qb.orderBy(column, dir);
  }

  private async countGrouped(
    qb: SelectQueryBuilder<ClientWishlistItem>,
  ): Promise<number> {
    const clone = qb.clone();
    clone.expressionMap.orderBys = {};
    clone.offset(undefined);
    clone.limit(undefined);
    const raw = await this.wishlistRepo.manager
      .createQueryBuilder()
      .select("COUNT(*)", "total")
      .from(`(${clone.getQuery()})`, "grouped")
      .setParameters(clone.getParameters())
      .getRawOne<{ total: string | number }>();
    return Number(raw?.total ?? 0);
  }

  private async loadSummary(
    workspaceId: number,
    currency: string,
    range: AnalyticsDateRange,
  ): Promise<{
    requests: number;
    waitingProducts: number;
    potentialRevenue: number;
    potentialProfit: number;
  }> {
    const raw = await this.wishlistRepo
      .createQueryBuilder("w")
      .innerJoin("w.product", "p")
      .innerJoin("w.variant", "v")
      .leftJoin(
        "variant_stocks",
        "vs",
        "vs.variant_id = w.variant_id AND vs.workspace_id = w.workspace_id",
      )
      .select("COUNT(*)::int", "requests")
      .addSelect("COUNT(DISTINCT w.variant_id)::int", "waiting_products")
      .addSelect(
        `COALESCE(SUM(CASE WHEN p.currency = :currency THEN ${SELLING_PRICE_SQL} ELSE 0 END), 0)`,
        "potential_revenue",
      )
      .addSelect(
        `COALESCE(SUM(CASE
          WHEN p.currency = :currency AND vs.avg_purchase_price IS NOT NULL
          THEN ${SELLING_PRICE_SQL} - vs.avg_purchase_price
          ELSE 0
        END), 0)`,
        "potential_profit",
      )
      .where("w.workspace_id = :workspaceId", { workspaceId })
      .andWhere("w.at >= :from AND w.at <= :to", {
        from: range.from,
        to: range.to,
      })
      .setParameter("currency", currency)
      .getRawOne<SummaryRaw>();

    return {
      requests: Number(raw?.requests ?? 0),
      waitingProducts: Number(raw?.waiting_products ?? 0),
      potentialRevenue: roundAnalyticsMoney(Number(raw?.potential_revenue ?? 0)),
      potentialProfit: roundAnalyticsMoney(Number(raw?.potential_profit ?? 0)),
    };
  }

  private async loadPotentialSalesSummary(
    groupedQb: SelectQueryBuilder<ClientWishlistItem>,
  ): Promise<{
    potentialRevenue: number;
    potentialProfit: number;
    sellableQty: number;
    productsCount: number;
  }> {
    const inner = groupedQb.clone();
    inner.expressionMap.orderBys = {};
    const raw = await this.wishlistRepo.manager
      .createQueryBuilder()
      .select("COALESCE(SUM(g.potential_revenue), 0)", "potential_revenue")
      .addSelect("COALESCE(SUM(g.potential_profit), 0)", "potential_profit")
      .addSelect("COALESCE(SUM(g.sellable_qty), 0)", "sellable_qty")
      .addSelect("COUNT(*)::int", "products_count")
      .from(`(${inner.getQuery()})`, "g")
      .setParameters(inner.getParameters())
      .getRawOne<{
        potential_revenue: string | number;
        potential_profit: string | number;
        sellable_qty: string | number;
        products_count: string | number;
      }>();

    return {
      potentialRevenue: Number(raw?.potential_revenue ?? 0),
      potentialProfit: Number(raw?.potential_profit ?? 0),
      sellableQty: Number(raw?.sellable_qty ?? 0),
      productsCount: Number(raw?.products_count ?? 0),
    };
  }

  private mapDemandItem(row: DemandRowRaw) {
    return {
      productId: Number(row.product_id),
      variantId: row.variant_id == null ? null : Number(row.variant_id),
      productName: row.product_name,
      variantName: row.variant_name ?? null,
      imageUrl: row.image_url ?? null,
      categoryName: row.category_name ?? null,
      waitingCount: Number(row.waiting_count),
      availableQty: Number(row.available_qty),
      sellingPrice: Number(row.selling_price),
      potentialRevenue: roundAnalyticsMoney(Number(row.potential_revenue)),
      potentialProfit: roundAnalyticsMoney(Number(row.potential_profit)),
    };
  }
}
