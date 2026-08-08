import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { AnalyticsQueryDto } from "./analytics-query.dto";

export enum AnalyticsTopValuableClientsSort {
  lifetimeValue = "lifetimeValue",
  periodRevenue = "periodRevenue",
  orders = "orders",
  lastPurchase = "lastPurchase",
}

export class AnalyticsClientsTopQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: AnalyticsTopValuableClientsSort,
    default: AnalyticsTopValuableClientsSort.lifetimeValue,
  })
  @IsOptional()
  @IsEnum(AnalyticsTopValuableClientsSort)
  sort?: AnalyticsTopValuableClientsSort;

  @ApiPropertyOptional({ default: 50, maximum: 50, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
