import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateOrderRefundDto {
  @ApiProperty({
    description:
      "Refund amount. Cannot exceed currently paid amount. Creates a pending refund that must be approved.",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: "When the refund is considered to have occurred (defaults to now).",
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
