import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class OrderEventResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  orderId: number;

  @ApiProperty({
    description:
      "Event type, e.g. order.created, order.status_changed, order.waybill_created",
  })
  type: string;

  @ApiPropertyOptional({ nullable: true })
  actorId: number | null;

  @ApiPropertyOptional({ nullable: true })
  userId: number | null;

  @ApiPropertyOptional({ nullable: true, type: "object", additionalProperties: true })
  payload: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: Date;
}

export class OrderEventsListResponseDto {
  @ApiProperty({ type: [OrderEventResponseDto] })
  items: OrderEventResponseDto[];
}
