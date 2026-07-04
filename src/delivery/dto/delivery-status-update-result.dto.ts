import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Order } from "../../database/entities/order.entity";
import { OrderDeliveryInfo } from "../../database/entities/order-delivery-info.entity";
import { NormalizedDeliveryStatus } from "../normalized-delivery-status.enum";

export class DeliveryStatusUpdateResultDto {
  @ApiProperty({ type: () => OrderDeliveryInfo })
  delivery: OrderDeliveryInfo;

  @ApiPropertyOptional({ type: () => Order, nullable: true })
  order: Order | null;

  @ApiProperty({ enum: NormalizedDeliveryStatus })
  normalizedStatus: NormalizedDeliveryStatus;

  @ApiPropertyOptional({
    description: "Order status id applied from integration mapping, if any.",
    nullable: true,
  })
  appliedOrderStatusId: number | null;
}
