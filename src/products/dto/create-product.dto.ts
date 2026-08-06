import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ProductSourceType } from "../../database/entities/product-source-type.enum";
import { ProductStatus } from "../../database/entities/product-status.enum";
import { ProductType } from "../../database/entities/product-type.enum";
import { CreateProductVariantInputDto } from "./create-product-variant-input.dto";
import { ProductShippingFieldsDto } from "./product-shipping-fields.dto";

class CreateProductBodyDto {
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty({ message: "name is required" })
  @MaxLength(512)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(100_000)
  description?: string;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.active })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    enum: ProductType,
    default: ProductType.single,
    description:
      "single = product with one variant (variant is auto-created if omitted); variants = multiple SKUs.",
  })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional({ enum: ProductSourceType })
  @IsOptional()
  @IsEnum(ProductSourceType)
  sourceType?: ProductSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ default: "UAH", maxLength: 8 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const t = value.trim().toLowerCase();
      if (t === "true") return true;
      if (t === "false") return false;
    }
    return value;
  })
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({
    description:
      "Staged upload_media ids for product-level gallery (from POST /products/upload-media).",
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  mediaIds?: number[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Optional category in this workspace (non-deleted). " +
      "Omit, send `null`, or empty string to leave the product uncategorized (`categoryId: null`).",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const t = value.trim();
      if (t === "" || t === "null" || t === "undefined") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : value;
    }
    if (value === 0 || value === -1) return null;
    return value;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @ApiPropertyOptional({
    type: [CreateProductVariantInputDto],
    description:
      "Required when productType is variants. For single, omit to auto-create one variant from product fields, or send exactly one row.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantInputDto)
  variants?: CreateProductVariantInputDto[];
}

export class CreateProductDto extends IntersectionType(
  ProductShippingFieldsDto,
  CreateProductBodyDto,
) {}
