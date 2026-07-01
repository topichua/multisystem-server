import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Order aggregates embedded on `ClientResponseDto` when `include_order_stat=true`. */
export class ClientOrderStatDto {
  @ApiProperty({ description: "Number of orders for this client", example: 4 })
  orderCount: number;

  @ApiProperty({
    description: "Sum of `totalAmount` across all orders",
    example: 8910,
  })
  totalSpent: number;

  @ApiProperty({
    description: "Mean `totalAmount` per order; 0 when there are no orders",
    example: 2227.5,
  })
  averageOrderPrice: number;

  @ApiPropertyOptional({
    nullable: true,
    description: "`created_at` of the most recent order; null if none",
    example: "2026-05-31T12:00:00.000Z",
  })
  lastOrderAt: Date | null;
}
