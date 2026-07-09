import { ApiProperty } from "@nestjs/swagger";

export class AnalyticsRevenueChartPointDto {
  @ApiProperty({ example: "1 тиж" })
  label: string;

  @ApiProperty({ example: "2026-06-01T00:00:00.000Z" })
  dateFrom: string;

  @ApiProperty({ example: "2026-06-07T23:59:59.999Z" })
  dateTo: string;

  @ApiProperty({ example: 52000 })
  value: number;
}

export class AnalyticsRevenueChartResponseDto {
  @ApiProperty({ type: [AnalyticsRevenueChartPointDto] })
  points: AnalyticsRevenueChartPointDto[];
}
