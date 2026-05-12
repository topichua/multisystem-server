import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { ProductMediaType } from "../../database/entities/product-media-type.enum";

export class CreateProductMediaDto {
  @ApiProperty({
    description:
      "Absolute or CDN URL. Not used by `POST /products/:id/media` (that route accepts multipart `image` only).",
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(20_000)
  url: string;

  @ApiProperty({ enum: ProductMediaType })
  @IsEnum(ProductMediaType)
  type: ProductMediaType;

  @ApiPropertyOptional({
    description:
      "Optional provenance URL. Ignored by `POST /products/:id/media` (multipart upload).",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(20_000)
  sourceUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      "If set, media is attached to this variant; must belong to the product in the URL path.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variantId?: number;
}
