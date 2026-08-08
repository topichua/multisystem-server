import { ApiProperty } from "@nestjs/swagger";

export class AnalyticsKpiValueDto {
  @ApiProperty({ example: 142 })
  value: number;

  @ApiProperty({ example: 8.1 })
  changePercent: number;
}

export class AnalyticsCurrencyKpiValueDto extends AnalyticsKpiValueDto {
  @ApiProperty({ example: "UAH" })
  currency: string;
}

export class AnalyticsOverviewKpiResponseDto {
  @ApiProperty({ type: AnalyticsCurrencyKpiValueDto })
  revenue: AnalyticsCurrencyKpiValueDto;

  @ApiProperty({
    type: AnalyticsCurrencyKpiValueDto,
    description:
      "Валовий прибуток: сума по order_items (ціна продажу − закупівельна/собівартість).",
  })
  grossProfit: AnalyticsCurrencyKpiValueDto;

  @ApiProperty({ type: AnalyticsKpiValueDto })
  orders: AnalyticsKpiValueDto;

  @ApiProperty({ type: AnalyticsCurrencyKpiValueDto })
  averageOrderValue: AnalyticsCurrencyKpiValueDto;

  @ApiProperty({ type: AnalyticsKpiValueDto })
  newClients: AnalyticsKpiValueDto;
}
