import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCorrectionDto {
  @ApiProperty()
  @IsInt()
  variantId: number;

  @ApiProperty({
    description: "Signed quantity change. Must not be 0. Negative = write-off.",
    example: -3,
  })
  @IsInt()
  quantityChange: number;

  @ApiPropertyOptional({
    description:
      "Free-text reason (e.g. \"брак\", \"втрата\"). Required when quantityChange < 0.",
    example: "брак",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
