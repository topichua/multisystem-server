import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Order aggregates embedded on `ClientResponseDto` when `include_order_stat=true`. */
export class ClientOrderStatDto {
  @ApiProperty({ description: "Number of orders for this client" })
  orderCount: number;

  @ApiProperty({ description: "Sum of `totalAmount` across all orders" })
  totalSpent: number;

  @ApiProperty({
    description: "Mean `totalAmount` per order; 0 when there are no orders",
  })
  averageOrderPrice: number;

  @ApiPropertyOptional({
    nullable: true,
    description: "`created_at` of the most recent order; null if none",
  })
  lastOrderAt: Date | null;
}
