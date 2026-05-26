import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";

export class CreateVariantCustomFieldDto {
  @ApiProperty({
    example: "material",
    description: "Lowercase slug; use `color` or `size` to map to variant columns",
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, {
    message: "key must be lowercase letters, digits, underscores; start with a letter",
  })
  key: string;

  @ApiProperty({ example: "Material" })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(128)
  label: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  @IsEnum(VariantCustomFieldType)
  type: VariantCustomFieldType;

  @ApiPropertyOptional({
    type: [String],
    description: "Required when type is `options`",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean)
      : value,
  )
  options?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateVariantCustomFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(128)
  label?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean)
      : value,
  )
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
