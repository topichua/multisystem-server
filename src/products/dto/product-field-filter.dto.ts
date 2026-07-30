import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export enum ProductFieldFilterMode {
  /** Any value set for this characteristic. */
  all = "all",
  /** Options: match any of the listed option ids. */
  in = "in",
  /** Text: case-insensitive contains. */
  contains = "contains",
}

export class ProductFieldFilterDto {
  @ApiProperty({ description: "workspace_variant_custom_field id" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fieldId!: number;

  @ApiProperty({ enum: ProductFieldFilterMode })
  @IsEnum(ProductFieldFilterMode)
  mode!: ProductFieldFilterMode;

  @ApiPropertyOptional({
    type: [String],
    description:
      "For `in`: option ids (comma-separated in the query). For `contains`: text keyword. Omitted for `all`.",
  })
  @ValidateIf((o: ProductFieldFilterDto) => o.mode !== ProductFieldFilterMode.all)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  values?: string[];
}

export class ProductFieldFiltersWrapperDto {
  @ApiPropertyOptional({ type: [ProductFieldFilterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductFieldFilterDto)
  fieldFilters?: ProductFieldFilterDto[];
}
