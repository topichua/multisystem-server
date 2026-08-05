import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export enum OrderExportMode {
  orders = "orders",
  order_items = "order_items",
}

export enum OrderExportFormat {
  xlsx = "xlsx",
  csv = "csv",
}

/** Same filters as GET /orders (without page/pageSize). */
export class OrderExportFiltersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statusId?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  statuses?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @ApiPropertyOptional({ description: "Alias for keyword (UI search)." })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: "Alias for createdFrom." })
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @ApiPropertyOptional({ description: "Alias for createdTo." })
  @IsOptional()
  @IsDateString()
  createdAtTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPriceFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPriceTo?: number;

  @ApiPropertyOptional({ description: "Alias for totalPriceFrom." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalFrom?: number;

  @ApiPropertyOptional({ description: "Alias for totalPriceTo." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalTo?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];
}

export class CreateOrderExportDto {
  @ApiProperty({
    enum: OrderExportMode,
    description:
      "`orders` — one row per order; `order_items` — one row per line item.",
  })
  @IsEnum(OrderExportMode)
  type!: OrderExportMode;

  @ApiProperty({ enum: OrderExportFormat })
  @IsEnum(OrderExportFormat)
  format!: OrderExportFormat;

  @ApiPropertyOptional({
    type: OrderExportFiltersDto,
    description:
      "Same filters as GET /orders. Flat alias fields on this body are also accepted.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderExportFiltersDto)
  filters?: OrderExportFiltersDto;

  // Flat aliases (UI may send list query shape at top level)
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statusId?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  statuses?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAtTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPriceFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPriceTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalTo?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];
}
