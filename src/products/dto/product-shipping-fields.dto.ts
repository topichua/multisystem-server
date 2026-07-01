import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsNumber, IsOptional, Min } from "class-validator";

const SHIPPING_DECIMAL_PLACES = 3;

function pickOptionalNumber(
  obj: Record<string, unknown>,
  camel: string,
  snake: string,
): number | null | undefined {
  const camelVal = obj[camel];
  if (camelVal !== undefined) {
    return camelVal === null ? null : Number(camelVal);
  }
  const snakeVal = obj[snake];
  if (snakeVal !== undefined) {
    return snakeVal === null ? null : Number(snakeVal);
  }
  return undefined;
}

export class ProductShippingFieldsDto {
  @ApiPropertyOptional({
    description:
      "Product weight in grams (shared across all variants). Also accepted as `weight_grams`.",
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value, obj }) =>
    pickOptionalNumber(
      obj as Record<string, unknown>,
      "weightGrams",
      "weight_grams",
    ) ?? value,
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  weightGrams?: number | null;

  /** Snake_case alias for `weightGrams` (whitelisted for UI payloads). */
  @IsOptional()
  @Type(() => Number)
  weight_grams?: number | null;

  @ApiPropertyOptional({
    description: "Package length in centimeters. Also accepted as `length_cm`.",
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value, obj }) =>
    pickOptionalNumber(
      obj as Record<string, unknown>,
      "lengthCm",
      "length_cm",
    ) ?? value,
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  lengthCm?: number | null;

  /** Snake_case alias for `lengthCm`. */
  @IsOptional()
  @Type(() => Number)
  length_cm?: number | null;

  @ApiPropertyOptional({
    description: "Package width in centimeters. Also accepted as `width_cm`.",
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value, obj }) =>
    pickOptionalNumber(
      obj as Record<string, unknown>,
      "widthCm",
      "width_cm",
    ) ?? value,
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  widthCm?: number | null;

  /** Snake_case alias for `widthCm`. */
  @IsOptional()
  @Type(() => Number)
  width_cm?: number | null;

  @ApiPropertyOptional({
    description: "Package height in centimeters. Also accepted as `height_cm`.",
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value, obj }) =>
    pickOptionalNumber(
      obj as Record<string, unknown>,
      "heightCm",
      "height_cm",
    ) ?? value,
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: SHIPPING_DECIMAL_PLACES })
  @Min(0)
  heightCm?: number | null;

  /** Snake_case alias for `heightCm`. */
  @IsOptional()
  @Type(() => Number)
  height_cm?: number | null;
}
