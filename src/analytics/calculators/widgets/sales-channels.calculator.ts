import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsSalesChannelsResult } from "../../types/analytics-overview-widgets.types";
import type { AnalyticsMetricCalculator } from "../analytics-metric-calculator.interface";
import { applyAnalyticsPeriodScope } from "../../utils/analytics-order-query.util";
import { resolveOrderSourceLabel } from "../../utils/analytics-order-source-label.util";
import { calculateSharePercent } from "../../utils/analytics-percent.util";

type SalesChannelRow = {
  source: string;
  orders: string | number;
};

@Injectable()
export class SalesChannelsCalculator
  implements AnalyticsMetricCalculator<AnalyticsSalesChannelsResult>
{
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsSalesChannelsResult> {
    const qb = this.orderRepo.createQueryBuilder("o");
    applyAnalyticsPeriodScope(qb, "o", context);

    const rows = await qb
      .select("o.source", "source")
      .addSelect("COUNT(o.id)::int", "orders")
      .groupBy("o.source")
      .orderBy("orders", "DESC")
      .addOrderBy("o.source", "ASC")
      .getRawMany<SalesChannelRow>();

    const channels = rows.map((row) => ({
      source: row.source,
      orders: Number(row.orders ?? 0),
    }));
    const totalOrders = channels.reduce((sum, row) => sum + row.orders, 0);

    return {
      totalOrders,
      channels: channels.map((row) => ({
        name: resolveOrderSourceLabel(row.source),
        orders: row.orders,
        percent: calculateSharePercent(row.orders, totalOrders),
      })),
    };
  }
}
