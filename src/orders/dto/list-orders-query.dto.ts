import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    description: "Filter by custom order status id in this workspace",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statusId?: number;

  @ApiPropertyOptional({
    description: "Filter orders for this client (workspace customer id)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;

  @ApiPropertyOptional({
    description:
      "Filter by multiple status ids (comma or repeated query). Empty = all",
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  statuses?: number[];

  @ApiPropertyOptional({
    description:
      "Case-insensitive keyword search across customer first/last name, phone, tracking number, and order number.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value == null || typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @ApiPropertyOptional({ description: "Created at >= ISO date" })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: "Created at <= ISO date" })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: "Total amount >=" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPriceFrom?: number;

  @ApiPropertyOptional({ description: "Total amount <=" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPriceTo?: number;

  @ApiPropertyOptional({
    description: "Filter by sources: instagram, telegram, manual (empty = all)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];
}
