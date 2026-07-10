import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from "class-validator";

export class UpdateCreditPricingRequestDto {
  @ApiPropertyOptional({ example: 1, description: "Price per one AI credit" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  pricePerCredit?: number;

  @ApiPropertyOptional({ example: "UAH" })
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minPurchaseCredits?: number;

  @ApiPropertyOptional({ nullable: true, example: 100000 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(10_000_000)
  maxPurchaseCredits?: number | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;
}
