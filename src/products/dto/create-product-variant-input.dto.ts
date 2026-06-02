import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ProductStatus } from "../../database/entities/product-status.enum";
import { VariantCustomFieldAttributeDto } from "./variant-custom-field-attribute.dto";

export class CreateProductVariantInputDto {
  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.draft })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    type: [VariantCustomFieldAttributeDto],
    description:
      "Variant attributes: reference an existing field by `field.id`, or create one with `field.name` + `field.type` (OPTION | TEXT).",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantCustomFieldAttributeDto)
  customFields?: VariantCustomFieldAttributeDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(128)
  sku?: string;

  @ApiPropertyOptional({
    description:
      "Staged upload_media ids for this variant (POST /products/upload-media). " +
      "On PUT /products/:id with `variants`, this is the full gallery: ids not listed are removed. " +
      "Omit or send `[]` for no images. The same id may appear on multiple variants.",
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  mediaIds?: number[];
}
