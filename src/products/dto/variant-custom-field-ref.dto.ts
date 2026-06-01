import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { VariantCustomFieldApiType } from "../../variant-custom-fields/dto/variant-custom-field-api-type.enum";

export class VariantCustomFieldRefDto {
  @ApiPropertyOptional({
    description: "Existing workspace_variant_custom_field id",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;

  @ApiPropertyOptional({
    description: "Required when `id` is omitted — display name for a new field",
  })
  @ValidateIf((o: VariantCustomFieldRefDto) => o.id == null)
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({
    enum: VariantCustomFieldApiType,
    description: "Required when `id` is omitted",
  })
  @ValidateIf((o: VariantCustomFieldRefDto) => o.id == null)
  @IsEnum(VariantCustomFieldApiType)
  type?: VariantCustomFieldApiType;
}
