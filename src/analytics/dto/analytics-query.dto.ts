import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { AnalyticsPeriod } from "../types/analytics-period.enum";

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: AnalyticsPeriod,
    description:
      "Predefined analytics period. Ignored when both `dateFrom` and `dateTo` are provided.",
    default: AnalyticsPeriod.d30,
  })
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod;

  @ApiPropertyOptional({
    description: "Custom range start (ISO date). Takes priority over `period`.",
    example: "2026-06-01",
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: "Custom range end (ISO date). Takes priority over `period`.",
    example: "2026-06-30",
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ type: [Number], description: "Reserved for future filters." })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  channelIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: "Reserved for future filters." })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  managerIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: "Reserved for future filters." })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  orderStatusIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: "Reserved for future filters." })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: "Reserved for future filters." })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  categoryIds?: number[];

  @ApiPropertyOptional({ type: [String], description: "Reserved for future filters." })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  clientTags?: string[];

  @ApiPropertyOptional({ type: [String], description: "Reserved for future filters." })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  instagramAccounts?: string[];
}
