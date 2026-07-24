import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateManualPaymentDto {
  @ApiProperty({
    description:
      "Amount to collect. Creates a pending manual charge; confirm later to mark paid. " +
      "Amount may exceed remaining balance; confirming then sets payment status to `overpaid`.",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({
    description: "When the payment is expected / recorded (defaults to now)",
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({
    description: "Optional external reference (receipt, transfer id, etc.)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({
    description: "Note for managers, e.g. paid to FOP card",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: "Manual payment method (IBAN/card). Omit for cash payment.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  manualPaymentMethodId?: number;
}
