import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { VariantCustomFieldRefDto } from "./variant-custom-field-ref.dto";

export class VariantCustomFieldAttributeDto {
  @ApiProperty({ type: VariantCustomFieldRefDto })
  @ValidateNested()
  @Type(() => VariantCustomFieldRefDto)
  field: VariantCustomFieldRefDto;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(512)
  value: string;

  @ApiPropertyOptional({
    description:
      "Display order among this variant's custom fields (lower first). Defaults to array index when omitted.",
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}
