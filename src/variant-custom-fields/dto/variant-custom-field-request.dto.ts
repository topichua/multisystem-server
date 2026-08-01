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
    description:
      "Lowercase slug; use `color` or `size` to map to variant columns",
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, {
    message:
      "key must be lowercase letters, digits, underscores; start with a letter",
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

  @ApiPropertyOptional({
    example: "Розмір",
    description:
      "Optional short UI name (e.g. `Розмір` when `label` is `Взуття: розмір`). " +
      "When omitted, left null — clients should use `label`.",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @MaxLength(128)
  displayName?: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  @IsEnum(VariantCustomFieldType)
  type: VariantCustomFieldType;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Predefined option labels for type `options`; can be added later via POST /workspace/variant-custom-fields/:id/option",
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

  @ApiPropertyOptional({
    description: "Short UI name. Pass null to clear (UI falls back to `label`).",
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    return typeof value === "string" ? value.trim() : value;
  })
  @MaxLength(128)
  displayName?: string | null;

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
