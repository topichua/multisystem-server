import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Min } from "class-validator";

export class CreateOrderPaymentLinkDto {
  @ApiPropertyOptional({
    description:
      "Amount to collect. Defaults to remaining order balance validated on backend.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    description: "Connected payment integration id. Uses default when omitted.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId?: number;
}
