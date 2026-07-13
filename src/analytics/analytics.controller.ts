import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { AnalyticsOverviewService } from "./analytics-overview.service";
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import { AnalyticsOverviewKpiResponseDto } from "./dto/analytics-kpi-response.dto";
import { AnalyticsRevenueChartResponseDto } from "./dto/analytics-revenue-chart-response.dto";
import {
  AnalyticsOrdersByStatusResponseDto,
  AnalyticsSalesChannelsResponseDto,
  AnalyticsTopCustomersResponseDto,
  AnalyticsTopProductsResponseDto,
} from "./dto/analytics-overview-widgets-response.dto";

@ApiTags("analytics")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("analytics/overview")
export class AnalyticsController {
  constructor(private readonly overview: AnalyticsOverviewService) {}

  @Get("kpi")
  @ApiOperation({
    summary: "Analytics overview KPI",
    description:
      "Returns revenue, orders, average order value, and new clients for the selected period with changePercent vs the previous period of equal length.",
  })
  @ApiOkResponse({ type: AnalyticsOverviewKpiResponseDto })
  async getKpi(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsOverviewKpiResponseDto> {
    return this.overview.getKpi(this.requireNumericOwnerId(req), query);
  }

  @Get("revenue-chart")
  @ApiOperation({
    summary: "Analytics overview revenue chart",
    description:
      "Returns time-series revenue points for the selected period. Buckets: daily for 7d, weekly for 30d, monthly for quarter/year.",
  })
  @ApiOkResponse({ type: AnalyticsRevenueChartResponseDto })
  async getRevenueChart(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsRevenueChartResponseDto> {
    return this.overview.getRevenueChart(
      this.requireNumericOwnerId(req),
      query,
    );
  }

  @Get("sales-channels")
  @ApiOperation({
    summary: "Analytics sales channels",
    description:
      "Distribution of orders by sales source for the selected period.",
  })
  @ApiOkResponse({ type: AnalyticsSalesChannelsResponseDto })
  async getSalesChannels(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsSalesChannelsResponseDto> {
    return this.overview.getSalesChannels(
      this.requireNumericOwnerId(req),
      query,
    );
  }

  @Get("orders-by-status")
  @ApiOperation({
    summary: "Analytics orders by status",
    description:
      "Order counts per workspace status for the selected period, sorted by workspace status order.",
  })
  @ApiOkResponse({ type: AnalyticsOrdersByStatusResponseDto })
  async getOrdersByStatus(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsOrdersByStatusResponseDto> {
    return this.overview.getOrdersByStatus(
      this.requireNumericOwnerId(req),
      query,
    );
  }

  @Get("top-products")
  @ApiOperation({
    summary: "Analytics top products",
    description:
      "Top 10 products by sold line-item revenue using order item snapshots.",
  })
  @ApiOkResponse({ type: AnalyticsTopProductsResponseDto })
  async getTopProducts(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsTopProductsResponseDto> {
    return this.overview.getTopProducts(this.requireNumericOwnerId(req), query);
  }

  @Get("top-customers")
  @ApiOperation({
    summary: "Analytics top customers",
    description:
      "Top 10 customers by spent amount using order total snapshots.",
  })
  @ApiOkResponse({ type: AnalyticsTopCustomersResponseDto })
  async getTopCustomers(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsTopCustomersResponseDto> {
    return this.overview.getTopCustomers(
      this.requireNumericOwnerId(req),
      query,
    );
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
