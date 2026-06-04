import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class VariantCustomFieldOptionDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  label: string;
}

export class VariantCustomFieldOptionRequestDto {
  @ApiProperty({ description: "Option label" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  label: string;
}
