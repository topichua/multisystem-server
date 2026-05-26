import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ProductStatus } from "../../database/entities/product-status.enum";

function trimOptionalString(value: unknown): string | undefined {
  if (value == null || typeof value !== "string") return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

export class ListCatalogVariantsQueryDto {
  @ApiPropertyOptional({
    description:
      "Search product name, variant SKU, and custom field values (case-insensitive).",
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(256)
  q?: string;

  @ApiPropertyOptional({
    description: "Alias for `q`.",
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    default: ProductStatus.active,
    description:
      "Filter by product status. Defaults to `active` when omitted.",
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
