import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OrderItem } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsTopProductsResult } from "../../types/analytics-overview-widgets.types";
import type { AnalyticsMetricCalculator } from "../analytics-metric-calculator.interface";
import {
  applyAnalyticsOrderRange,
  applyAnalyticsWorkspaceScope,
  applyReservedAnalyticsFilters,
} from "../../utils/analytics-order-query.util";
import { roundAnalyticsMoney } from "../../utils/analytics-math.util";

const TOP_PRODUCTS_LIMIT = 10;

type TopProductRow = {
  productId: string | number;
  variantId: string | number;
  productTitleSnapshot: string;
  variantTitleSnapshot: string | null;
  imageUrlSnapshot: string | null;
  revenue: string | number;
  sold_quantity: string | number;
};

@Injectable()
export class TopProductsCalculator implements AnalyticsMetricCalculator<AnalyticsTopProductsResult> {
  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsTopProductsResult> {
    const qb = this.orderItemRepo
      .createQueryBuilder("oi")
      .innerJoin("oi.order", "o")
      .leftJoin("o.status", "analyticsOrderStatus");

    applyAnalyticsWorkspaceScope(qb, "o", context);
    applyAnalyticsOrderRange(qb, "o", context.ranges.current);
    applyReservedAnalyticsFilters(qb, "o", context);
    qb.andWhere("analyticsOrderStatus.category != :analyticsCanceledCategory", {
      analyticsCanceledCategory: OrderStatusCategory.canceled,
    });

    const rows = await qb
      .select("oi.productId", "productId")
      .addSelect("oi.variantId", "variantId")
      .addSelect("oi.productTitleSnapshot", "productTitleSnapshot")
      .addSelect("oi.variantTitleSnapshot", "variantTitleSnapshot")
      .addSelect("MAX(oi.imageUrlSnapshot)", "imageUrlSnapshot")
      .addSelect(
        "COALESCE(SUM(COALESCE(oi.totalSaleAmount, oi.totalPriceAmount)), 0)",
        "revenue",
      )
      .addSelect("COALESCE(SUM(oi.quantity), 0)", "sold_quantity")
      .groupBy("oi.productId")
      .addGroupBy("oi.variantId")
      .addGroupBy("oi.productTitleSnapshot")
      .addGroupBy("oi.variantTitleSnapshot")
      .orderBy(
        "COALESCE(SUM(COALESCE(oi.totalSaleAmount, oi.totalPriceAmount)), 0)",
        "DESC",
      )
      .addOrderBy("COALESCE(SUM(oi.quantity), 0)", "DESC")
      .addOrderBy("oi.productId", "ASC")
      .addOrderBy("oi.variantId", "ASC")
      .limit(TOP_PRODUCTS_LIMIT)
      .getRawMany<TopProductRow>();

    return {
      products: rows.map((row) => ({
        productId: Number(row.productId),
        variantId: Number(row.variantId),
        name: buildProductLineName(
          row.productTitleSnapshot,
          row.variantTitleSnapshot,
        ),
        image: row.imageUrlSnapshot?.trim() || null,
        revenue: roundAnalyticsMoney(Number(row.revenue ?? 0)),
        soldQuantity: Number(row.sold_quantity ?? 0),
      })),
    };
  }
}

function buildProductLineName(
  productTitleSnapshot: string,
  variantTitleSnapshot: string | null,
): string {
  const productTitle = productTitleSnapshot.trim();
  const variantTitle = variantTitleSnapshot?.trim();
  if (!productTitle) {
    return variantTitle ?? "";
  }
  if (!variantTitle) {
    return productTitle;
  }
  return `${productTitle} — ${variantTitle}`;
}
