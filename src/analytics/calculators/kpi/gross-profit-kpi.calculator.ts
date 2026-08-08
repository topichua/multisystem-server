import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OrderItem } from "../../../database/entities";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsDateRange } from "../../types/analytics-date-range.types";
import type { AnalyticsRangeMetricCalculator } from "../analytics-metric-calculator.interface";
import {
  applyAnalyticsOrderExclusions,
  applyAnalyticsOrderRange,
  applyAnalyticsWorkspaceScope,
  applyReservedAnalyticsFilters,
} from "../../utils/analytics-order-query.util";
import { roundAnalyticsMoney } from "../../utils/analytics-math.util";

/**
 * Gross profit = sum over order lines of (sale − cost).
 * Prefer stored `profit_amount`; fall back to sale − cost snapshots when null.
 * Lines without cost contribute 0.
 */
@Injectable()
export class GrossProfitKpiCalculator implements AnalyticsRangeMetricCalculator {
  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
  ) {}

  async calculateForRange(
    context: AnalyticsFilterContext,
    range: AnalyticsDateRange,
  ): Promise<number> {
    const qb = this.orderItemRepo
      .createQueryBuilder("oi")
      .innerJoin("oi.order", "o");

    applyAnalyticsWorkspaceScope(qb, "o", context);
    applyAnalyticsOrderExclusions(qb, "o");
    applyAnalyticsOrderRange(qb, "o", range);
    applyReservedAnalyticsFilters(qb, "o", context);

    const raw = await qb
      .select(
        `COALESCE(SUM(
          COALESCE(
            oi.profit_amount,
            CASE
              WHEN oi.total_cost_amount IS NOT NULL THEN
                COALESCE(oi.total_sale_amount, oi.total_price_amount, 0)
                  - oi.total_cost_amount
              WHEN oi.unit_cost_snapshot IS NOT NULL THEN
                COALESCE(oi.total_sale_amount, oi.total_price_amount, 0)
                  - (oi.unit_cost_snapshot * oi.quantity)
              ELSE 0
            END
          )
        ), 0)`,
        "gross_profit",
      )
      .getRawOne<{ gross_profit: string | number }>();

    return roundAnalyticsMoney(Number(raw?.gross_profit ?? 0));
  }
}
