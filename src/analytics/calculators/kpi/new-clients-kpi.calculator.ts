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
export class NewClientsKpiCalculator implements AnalyticsRangeMetricCalculator {
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
    applyReservedAnalyticsFilters(qb, "o", context);

    const rows = await qb
      .select("o.customerId", "customerId")
      .addSelect("MIN(o.createdAt)", "firstOrderAt")
      .groupBy("o.customerId")
      .having("MIN(o.createdAt) >= :analyticsFrom", {
        analyticsFrom: range.from,
      })
      .andHaving("MIN(o.createdAt) <= :analyticsTo", { analyticsTo: range.to })
      .getRawMany<{ customerId: string; firstOrderAt: string }>();

    return rows.length;
  }
}
