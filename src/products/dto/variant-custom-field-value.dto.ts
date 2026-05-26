import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

export class VariantCustomFieldValueDto {
  @ApiProperty({ description: "workspace_variant_custom_field.id" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fieldId: number;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(128)
  value: string;
}
