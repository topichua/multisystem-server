import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsDateRange } from "../../types/analytics-date-range.types";
import type { AnalyticsRangeMetricCalculator } from "../analytics-metric-calculator.interface";
import {
  applyAnalyticsOrderExclusions,
  applyAnalyticsOrderRange,
  applyAnalyticsWorkspaceScope,
  applyReservedAnalyticsFilters,
} from "../../utils/analytics-order-query.util";

@Injectable()
export class OrdersKpiCalculator implements AnalyticsRangeMetricCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculateForRange(
    context: AnalyticsFilterContext,
    range: AnalyticsDateRange,
  ): Promise<number> {
    const qb = this.orderRepo.createQueryBuilder("o");
    applyAnalyticsWorkspaceScope(qb, "o", context);
    applyAnalyticsOrderExclusions(qb, "o");
    applyAnalyticsOrderRange(qb, "o", range);
    applyReservedAnalyticsFilters(qb, "o", context);

    const raw = await qb
      .select("COUNT(o.id)::int", "orderCount")
      .getRawOne<{ orderCount: string | number }>();

    return Number(raw?.orderCount ?? 0);
  }
}
