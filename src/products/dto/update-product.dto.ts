import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { ProductSourceType } from "../../database/entities/product-source-type.enum";
import { ProductStatus } from "../../database/entities/product-status.enum";

export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(512)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(100_000)
  description?: string | null;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ enum: ProductSourceType, nullable: true })
  @IsOptional()
  @IsEnum(ProductSourceType)
  sourceType?: ProductSourceType | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(255)
  sourceId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(255)
  referenceGroupId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @ApiPropertyOptional({ maxLength: 8 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(8)
  currency?: string;

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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  mainImageUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set to null to clear category.",
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;
}
