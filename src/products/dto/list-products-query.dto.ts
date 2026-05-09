import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ProductStatus } from "../../database/entities/product-status.enum";
import { ProductListSort } from "./product-list-sort.enum";

export class ListProductsQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    enum: ProductListSort,
    default: ProductListSort.created_desc,
    description:
      "Sort order: newest/oldest by creation time, name A–Z / Z–A, price ascending/descending.",
  })
  @IsOptional()
  @IsEnum(ProductListSort)
  sort?: ProductListSort;

  @ApiPropertyOptional({
    description:
      "Filter by categories: comma-separated ids (e.g. `1,2,3`) or repeated `categoryIds` query params. Only non-deleted categories in your workspace are accepted.",
    example: "1,2,3",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value == null || value === "") return undefined;
    const raw = Array.isArray(value)
      ? value
          .filter(
            (v): v is string | number =>
              typeof v === "string" || typeof v === "number",
          )
          .map(String)
          .join(",")
      : typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? value
          : undefined;
    if (raw === undefined) return undefined;
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.join(",");
  })
  @Matches(/^\d+(,\d+)*$/, {
    message:
      "categoryIds must be comma-separated positive integers (e.g. 1 or 1,2,3)",
  })
  categoryIds?: string;

  @ApiPropertyOptional({
    description:
      "Minimum product `price` (inclusive). Rows with `price` null are excluded when any price bound is set.",
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    description:
      "Maximum product `price` (inclusive). Rows with `price` null are excluded when any price bound is set.",
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description:
      "Page number (preferred). If provided, overrides `offset` together with `pageSize`.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 100,
    description:
      "Page size (preferred). If provided, maps to `limit`. Kept compatible with `limit`.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 100,
    description: "Legacy alias for `pageSize`.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    description: "Legacy offset. Ignored when `page` is provided.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
