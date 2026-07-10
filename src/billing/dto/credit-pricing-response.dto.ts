import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreditPricingResponseDto {
  @ApiProperty({ example: 1 })
  pricePerCredit: number;

  @ApiProperty({ example: "UAH" })
  currency: string;

  @ApiProperty({ example: 10 })
  minPurchaseCredits: number;

  @ApiPropertyOptional({ nullable: true, example: 100000 })
  maxPurchaseCredits: number | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}
