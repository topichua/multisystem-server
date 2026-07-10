import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsPositive, Max, Min } from "class-validator";

export class PurchaseCreditsRequestDto {
  @ApiProperty({
    example: 100,
    description: "Number of additional AI credits to buy",
  })
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(10_000_000)
  creditsAmount: number;
}
