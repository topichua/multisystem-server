import { Injectable } from "@nestjs/common";
import {
  calculateChangePercent,
  roundAnalyticsMoney,
} from "../../utils/analytics-math.util";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type {
  AnalyticsCurrencyKpiValue,
  AnalyticsKpiValue,
  AnalyticsOverviewKpiResult,
} from "../../types/analytics-kpi.types";
import type { AnalyticsMetricCalculator } from "../analytics-metric-calculator.interface";
import { NewClientsKpiCalculator } from "./new-clients-kpi.calculator";
import { OrdersKpiCalculator } from "./orders-kpi.calculator";
import { RevenueKpiCalculator } from "./revenue-kpi.calculator";

@Injectable()
export class AnalyticsKpiCalculator
  implements AnalyticsMetricCalculator<AnalyticsOverviewKpiResult>
{
  constructor(
    private readonly revenueCalculator: RevenueKpiCalculator,
    private readonly ordersCalculator: OrdersKpiCalculator,
    private readonly newClientsCalculator: NewClientsKpiCalculator,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsOverviewKpiResult> {
    const [currentRevenue, previousRevenue, currentOrders, previousOrders, currentNewClients, previousNewClients] =
      await Promise.all([
        this.revenueCalculator.calculateForRange(context, context.ranges.current),
        this.revenueCalculator.calculateForRange(context, context.ranges.previous),
        this.ordersCalculator.calculateForRange(context, context.ranges.current),
        this.ordersCalculator.calculateForRange(context, context.ranges.previous),
        this.newClientsCalculator.calculateForRange(
          context,
          context.ranges.current,
        ),
        this.newClientsCalculator.calculateForRange(
          context,
          context.ranges.previous,
        ),
      ]);

    const revenue: AnalyticsCurrencyKpiValue = {
      value: currentRevenue,
      currency: context.currency,
      changePercent: calculateChangePercent(currentRevenue, previousRevenue),
    };

    const orders: AnalyticsKpiValue = {
      value: currentOrders,
      changePercent: calculateChangePercent(currentOrders, previousOrders),
    };

    const averageOrderValue: AnalyticsCurrencyKpiValue = {
      value: this.calculateAverageOrderValue(currentRevenue, currentOrders),
      currency: context.currency,
      changePercent: calculateChangePercent(
        this.calculateAverageOrderValue(currentRevenue, currentOrders),
        this.calculateAverageOrderValue(previousRevenue, previousOrders),
      ),
    };

    const newClients: AnalyticsKpiValue = {
      value: currentNewClients,
      changePercent: calculateChangePercent(
        currentNewClients,
        previousNewClients,
      ),
    };

    return {
      revenue,
      orders,
      averageOrderValue,
      newClients,
    };
  }

  private calculateAverageOrderValue(
    revenue: number,
    orders: number,
  ): number {
    if (orders === 0) {
      return 0;
    }
    return roundAnalyticsMoney(revenue / orders);
  }
}
