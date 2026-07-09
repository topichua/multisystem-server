import { Injectable } from "@nestjs/common";
import { AnalyticsFilterBuilder } from "./filters/analytics-filter.builder";
import { AnalyticsKpiCalculator } from "./calculators/kpi/analytics-kpi.calculator";
import { RevenueChartCalculator } from "./calculators/charts/revenue-chart.calculator";
import { SalesChannelsCalculator } from "./calculators/widgets/sales-channels.calculator";
import { OrdersByStatusCalculator } from "./calculators/widgets/orders-by-status.calculator";
import { TopProductsCalculator } from "./calculators/widgets/top-products.calculator";
import { TopCustomersCalculator } from "./calculators/widgets/top-customers.calculator";
import type { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import type { AnalyticsOverviewKpiResult } from "./types/analytics-kpi.types";
import type { AnalyticsRevenueChartResult } from "./types/analytics-chart.types";
import type {
  AnalyticsOrdersByStatusResult,
  AnalyticsSalesChannelsResult,
  AnalyticsTopCustomersResult,
  AnalyticsTopProductsResult,
} from "./types/analytics-overview-widgets.types";

@Injectable()
export class AnalyticsOverviewService {
  constructor(
    private readonly filterBuilder: AnalyticsFilterBuilder,
    private readonly kpiCalculator: AnalyticsKpiCalculator,
    private readonly revenueChartCalculator: RevenueChartCalculator,
    private readonly salesChannelsCalculator: SalesChannelsCalculator,
    private readonly ordersByStatusCalculator: OrdersByStatusCalculator,
    private readonly topProductsCalculator: TopProductsCalculator,
    private readonly topCustomersCalculator: TopCustomersCalculator,
  ) {}

  async getKpi(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsOverviewKpiResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.kpiCalculator.calculate(context);
  }

  async getRevenueChart(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsRevenueChartResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.revenueChartCalculator.calculate(context);
  }

  async getSalesChannels(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsSalesChannelsResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.salesChannelsCalculator.calculate(context);
  }

  async getOrdersByStatus(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsOrdersByStatusResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.ordersByStatusCalculator.calculate(context);
  }

  async getTopProducts(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsTopProductsResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.topProductsCalculator.calculate(context);
  }

  async getTopCustomers(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsTopCustomersResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.topCustomersCalculator.calculate(context);
  }
}
