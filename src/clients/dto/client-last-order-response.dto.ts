import { ApiProperty } from "@nestjs/swagger";
import { OrderStatusCategory } from "../../database/entities/order-status-category.enum";

export class ClientLastOrderStatusDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: OrderStatusCategory })
  category: OrderStatusCategory;
}

export class ClientLastOrderResponseDto {
  @ApiProperty({ description: "Per-workspace order number" })
  id: number;

  @ApiProperty({ description: "Order total (`orders.total_amount`)" })
  total_price: number;

  @ApiProperty({ type: ClientLastOrderStatusDto })
  status: ClientLastOrderStatusDto;
}
