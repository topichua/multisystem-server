import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class ConfirmManualPaymentDto {
  @ApiPropertyOptional({
    description:
      "When the payment was actually received. Defaults to the pending transaction occurredAt.",
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({
    description: "Optional note update when confirming the payment as paid.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
