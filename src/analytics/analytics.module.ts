import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  ClientLink,
  ClientWishlistItem,
  InstagramUser,
  Order,
  OrderItem,
  OrderStatus,
  TelegramUser,
} from "../database/entities";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsClientsController } from "./analytics-clients.controller";
import { AnalyticsWishlistController } from "./analytics-wishlist.controller";
import { AnalyticsOverviewService } from "./analytics-overview.service";
import { AnalyticsClientsService } from "./analytics-clients.service";
import { WishlistAnalyticsService } from "./wishlist/wishlist-analytics.service";
import { AnalyticsDateRangeService } from "./date-range/analytics-date-range.service";
import { AnalyticsFilterBuilder } from "./filters/analytics-filter.builder";
import { AnalyticsKpiCalculator } from "./calculators/kpi/analytics-kpi.calculator";
import { RevenueKpiCalculator } from "./calculators/kpi/revenue-kpi.calculator";
import { GrossProfitKpiCalculator } from "./calculators/kpi/gross-profit-kpi.calculator";
import { OrdersKpiCalculator } from "./calculators/kpi/orders-kpi.calculator";
import { NewClientsKpiCalculator } from "./calculators/kpi/new-clients-kpi.calculator";
import { RevenueChartCalculator } from "./calculators/charts/revenue-chart.calculator";
import { SalesChannelsCalculator } from "./calculators/widgets/sales-channels.calculator";
import { OrdersByStatusCalculator } from "./calculators/widgets/orders-by-status.calculator";
import { TopProductsCalculator } from "./calculators/widgets/top-products.calculator";
import { TopCustomersCalculator } from "./calculators/widgets/top-customers.calculator";
import { AnalyticsClientAvatarService } from "./services/analytics-client-avatar.service";
import { ClientsKpiCalculator } from "./calculators/clients/clients-kpi.calculator";
import { NewVsRepeatClientsCalculator } from "./calculators/clients/new-vs-repeat-clients.calculator";
import { RepeatPurchaseFunnelCalculator } from "./calculators/clients/repeat-purchase-funnel.calculator";
import { ReturnTimingCalculator } from "./calculators/clients/return-timing.calculator";
import { WinBackClientsCalculator } from "./calculators/clients/win-back-clients.calculator";
import { TopValuableClientsCalculator } from "./calculators/clients/top-valuable-clients.calculator";
import { ClientAcquisitionSourcesCalculator } from "./calculators/clients/client-acquisition-sources.calculator";
import { OneTimeBuyersCalculator } from "./calculators/clients/one-time-buyers.calculator";

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
      ClientWishlistItem,
    ]),
  ],
  controllers: [
    AnalyticsController,
    AnalyticsClientsController,
    AnalyticsWishlistController,
  ],
  providers: [
    AnalyticsOverviewService,
    AnalyticsClientsService,
    WishlistAnalyticsService,
    AnalyticsDateRangeService,
    AnalyticsFilterBuilder,
    AnalyticsKpiCalculator,
    RevenueKpiCalculator,
    GrossProfitKpiCalculator,
    OrdersKpiCalculator,
    NewClientsKpiCalculator,
    RevenueChartCalculator,
    SalesChannelsCalculator,
    OrdersByStatusCalculator,
    TopProductsCalculator,
    TopCustomersCalculator,
    AnalyticsClientAvatarService,
    ClientsKpiCalculator,
    NewVsRepeatClientsCalculator,
    RepeatPurchaseFunnelCalculator,
    ReturnTimingCalculator,
    WinBackClientsCalculator,
    TopValuableClientsCalculator,
    ClientAcquisitionSourcesCalculator,
    OneTimeBuyersCalculator,
  ],
  exports: [
    AnalyticsOverviewService,
    AnalyticsClientsService,
    WishlistAnalyticsService,
  ],
})
export class AnalyticsModule {}
