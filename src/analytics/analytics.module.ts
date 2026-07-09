import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  ClientLink,
  InstagramUser,
  Order,
  OrderItem,
  OrderStatus,
  TelegramUser,
} from "../database/entities";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsOverviewService } from "./analytics-overview.service";
import { AnalyticsDateRangeService } from "./date-range/analytics-date-range.service";
import { AnalyticsFilterBuilder } from "./filters/analytics-filter.builder";
import { AnalyticsKpiCalculator } from "./calculators/kpi/analytics-kpi.calculator";
import { RevenueKpiCalculator } from "./calculators/kpi/revenue-kpi.calculator";
import { OrdersKpiCalculator } from "./calculators/kpi/orders-kpi.calculator";
import { NewClientsKpiCalculator } from "./calculators/kpi/new-clients-kpi.calculator";
import { RevenueChartCalculator } from "./calculators/charts/revenue-chart.calculator";
import { SalesChannelsCalculator } from "./calculators/widgets/sales-channels.calculator";
import { OrdersByStatusCalculator } from "./calculators/widgets/orders-by-status.calculator";
import { TopProductsCalculator } from "./calculators/widgets/top-products.calculator";
import { TopCustomersCalculator } from "./calculators/widgets/top-customers.calculator";
import { AnalyticsClientAvatarService } from "./services/analytics-client-avatar.service";

@Module({
  imports: [
    WorkspaceSettingsModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatus,
      Client,
      ClientLink,
      InstagramUser,
      TelegramUser,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsOverviewService,
    AnalyticsDateRangeService,
    AnalyticsFilterBuilder,
    AnalyticsKpiCalculator,
    RevenueKpiCalculator,
    OrdersKpiCalculator,
    NewClientsKpiCalculator,
    RevenueChartCalculator,
    SalesChannelsCalculator,
    OrdersByStatusCalculator,
    TopProductsCalculator,
    TopCustomersCalculator,
    AnalyticsClientAvatarService,
  ],
  exports: [AnalyticsOverviewService],
})
export class AnalyticsModule {}
