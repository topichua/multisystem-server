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
import { VariantCustomFieldValueDto } from "./variant-custom-field-value.dto";

export class UpdateProductVariantDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ type: [VariantCustomFieldValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantCustomFieldValueDto)
  customFields?: VariantCustomFieldValueDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return value;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const t = value.trim().toLowerCase();
      if (t === "true") return true;
      if (t === "false") return false;
    }
    return value;
  })
  @IsBoolean()
  inStock?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number | null;

  @ApiPropertyOptional({
    description:
      "Append variant gallery images from staged upload_media ids.",
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  mediaIds?: number[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(128)
  sku?: string | null;
}
