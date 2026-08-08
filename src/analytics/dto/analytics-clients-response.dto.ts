import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AnalyticsTopValuableClientsSort } from "./analytics-clients-query.dto";

export class AnalyticsClientsMetricDto {
  @ApiProperty({ example: 612 })
  value!: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Change vs previous period of equal length. Null for lifetime metrics.",
    example: 8.1,
  })
  changePercent!: number | null;

  @ApiProperty({ enum: ["period", "lifetime"], example: "period" })
  scope!: "period" | "lifetime";
}

export class AnalyticsClientsCurrencyMetricDto extends AnalyticsClientsMetricDto {
  @ApiProperty({ example: "UAH" })
  currency!: string;
}

export class AnalyticsClientsKpiResponseDto {
  @ApiProperty({
    type: AnalyticsClientsMetricDto,
    description:
      "Активні клієнти — унікальні покупці з ≥1 релевантним замовленням за період.",
  })
  activeClients!: AnalyticsClientsMetricDto;

  @ApiProperty({
    type: AnalyticsClientsMetricDto,
    description: "Нові клієнти — перша покупка в межах періоду.",
  })
  newClients!: AnalyticsClientsMetricDto;

  @ApiProperty({
    type: AnalyticsClientsMetricDto,
    description:
      "Повторні покупки (%) — частка активних клієнтів періоду з ≥2 замовленнями за весь час.",
  })
  repeatPurchaseRate!: AnalyticsClientsMetricDto;

  @ApiProperty({
    type: AnalyticsClientsCurrencyMetricDto,
    description:
      "Середня цінність клієнта (lifetime) — середня сума покупок одного клієнта за весь час.",
  })
  averageCustomerValue!: AnalyticsClientsCurrencyMetricDto;

  @ApiProperty({
    type: AnalyticsClientsMetricDto,
    description: "Замовлень на клієнта — середня кількість замовлень у періоді на активного клієнта.",
  })
  ordersPerClient!: AnalyticsClientsMetricDto;

  @ApiProperty({
    type: AnalyticsClientsMetricDto,
    description:
      "Час до повторної покупки (медіана днів між 1-ю та 2-ю покупкою). Lifetime. Value null → value=0 when no data.",
  })
  timeToRepurchaseDays!: AnalyticsClientsMetricDto;
}

export class AnalyticsNewVsRepeatSegmentDto {
  @ApiProperty({ enum: ["new", "repeat"] })
  key!: "new" | "repeat";

  @ApiProperty({ example: 124 })
  clients!: number;

  @ApiProperty({ example: 142000 })
  revenue!: number;

  @ApiProperty({ example: 43 })
  revenuePercent!: number;
}

export class AnalyticsNewVsRepeatResponseDto {
  @ApiProperty({ example: "UAH" })
  currency!: string;

  @ApiProperty({ example: 330000 })
  totalRevenue!: number;

  @ApiProperty({ type: [AnalyticsNewVsRepeatSegmentDto] })
  segments!: AnalyticsNewVsRepeatSegmentDto[];
}

export class AnalyticsRepeatFunnelStepDto {
  @ApiProperty({
    enum: ["orders_1_plus", "orders_2_plus", "orders_3_plus", "orders_4_plus"],
  })
  key!: string;

  @ApiProperty({ example: 2 })
  minOrders!: number;

  @ApiProperty({ example: 282 })
  clients!: number;

  @ApiProperty({ example: 46 })
  percent!: number;
}

export class AnalyticsRepeatFunnelResponseDto {
  @ApiProperty({ type: [AnalyticsRepeatFunnelStepDto] })
  steps!: AnalyticsRepeatFunnelStepDto[];
}

export class AnalyticsReturnTimingBucketDto {
  @ApiProperty({
    enum: ["d0_7", "d8_30", "d31_60", "d61_90", "d90_plus"],
    example: "d8_30",
  })
  key!: string;

  @ApiProperty({ example: 31 })
  clients!: number;

  @ApiProperty({ example: 31 })
  percent!: number;
}

export class AnalyticsReturnTimingResponseDto {
  @ApiProperty({ type: [AnalyticsReturnTimingBucketDto] })
  buckets!: AnalyticsReturnTimingBucketDto[];
}

export class AnalyticsWinBackBucketDto {
  @ApiProperty({ enum: ["d25_45", "d46_90", "d90_plus"], example: "d25_45" })
  key!: string;

  @ApiProperty({ example: 84 })
  clients!: number;
}

export class AnalyticsWinBackResponseDto {
  @ApiProperty({ type: [AnalyticsWinBackBucketDto] })
  buckets!: AnalyticsWinBackBucketDto[];

  @ApiProperty({ example: 172 })
  totalClients!: number;
}

export class AnalyticsTopValuableClientDto {
  @ApiProperty({ example: 19 })
  clientId!: number;

  @ApiProperty({ example: "Вікторія Гречко" })
  name!: string;

  @ApiProperty({ nullable: true })
  avatar!: string | null;

  @ApiProperty({ example: 5, description: "Lifetime order count." })
  orders!: number;

  @ApiProperty({ example: 16400, description: "Виручка за період." })
  periodRevenue!: number;

  @ApiProperty({ nullable: true, example: "2026-07-12T10:00:00.000Z" })
  lastPurchaseAt!: string | null;

  @ApiProperty({
    example: 42800,
    description: "Цінність за весь час (lifetime revenue).",
  })
  lifetimeValue!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 9200,
    description: "Валовий прибуток по позиціях замовлень у періоді.",
  })
  periodGrossProfit!: number | null;
}

export class AnalyticsTopValuableClientsResponseDto {
  @ApiProperty({ example: "UAH" })
  currency!: string;

  @ApiProperty({
    enum: AnalyticsTopValuableClientsSort,
    example: AnalyticsTopValuableClientsSort.lifetimeValue,
  })
  sort!: AnalyticsTopValuableClientsSort;

  @ApiProperty({ type: [AnalyticsTopValuableClientDto] })
  customers!: AnalyticsTopValuableClientDto[];
}

export class AnalyticsAcquisitionSourceDto {
  @ApiProperty({ example: "instagram" })
  source!: string;

  @ApiProperty({ example: "Instagram" })
  name!: string;

  @ApiProperty({ example: 78 })
  clients!: number;

  @ApiProperty({ example: 63 })
  percent!: number;
}

export class AnalyticsAcquisitionSourcesResponseDto {
  @ApiProperty({ example: 124 })
  totalNewClients!: number;

  @ApiProperty({ type: [AnalyticsAcquisitionSourceDto] })
  sources!: AnalyticsAcquisitionSourceDto[];
}

export class AnalyticsOneTimeBuyersResponseDto {
  @ApiProperty({ example: 330 })
  clients!: number;

  @ApiProperty({
    example: 54,
    description: "Частка клієнтської бази з ≥1 замовленням (0–100).",
  })
  percentOfBase!: number;
}
