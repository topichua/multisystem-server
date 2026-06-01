import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsString,
  MaxLength,
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
}
