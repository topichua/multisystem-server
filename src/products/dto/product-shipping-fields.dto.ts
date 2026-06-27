import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, Min } from "class-validator";

const SHIPPING_DECIMAL_PLACES = 3;

export class ProductShippingFieldsDto {
  @ApiPropertyOptional({
    description: "Product weight in grams (shared across all variants).",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  weightGrams?: number | null;

  @ApiPropertyOptional({
    description: "Package length in centimeters.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  lengthCm?: number | null;

  @ApiPropertyOptional({
    description: "Package width in centimeters.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  widthCm?: number | null;

  @ApiPropertyOptional({
    description: "Package height in centimeters.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  heightCm?: number | null;
}
