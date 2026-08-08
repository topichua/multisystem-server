import { ApiProperty } from "@nestjs/swagger";

export class OrderStatusAutomationCriteriaItemDto {
  @ApiProperty({
    example: "at_branch",
    description:
      "Value for `conditions[].sourceStatus` when `sourceType` is DELIVERY_STATUS or PAYMENT_STATUS.",
  })
  id!: string;

  @ApiProperty({ example: "На відділенні" })
  name!: string;
}

export class OrderStatusAutomationTargetCriteriaItemDto {
  @ApiProperty({
    example: 12,
    description:
      "Workspace order status id. Use as `targetOrderStatusId`, " +
      "or as `conditions[].sourceStatus` string when `sourceType` is `ORDER_STATUS`.",
  })
  id!: number;

  @ApiProperty({ example: "Завершено" })
  name!: string;
}

export class OrderStatusAutomationCriteriaResponseDto {
  @ApiProperty({
    type: [OrderStatusAutomationCriteriaItemDto],
    description:
      "Delivery statuses. Use `id` as `conditions[].sourceStatus` with `sourceType: DELIVERY_STATUS`.",
  })
  delivery!: OrderStatusAutomationCriteriaItemDto[];

  @ApiProperty({
    type: [OrderStatusAutomationCriteriaItemDto],
    description:
      "Payment statuses. Use `id` as `conditions[].sourceStatus` with `sourceType: PAYMENT_STATUS`.",
  })
  payment!: OrderStatusAutomationCriteriaItemDto[];

  @ApiProperty({
    type: [OrderStatusAutomationTargetCriteriaItemDto],
    description:
      "Workspace order statuses. Use `id` as `targetOrderStatusId` (action), " +
      "or as `conditions[].sourceStatus` (string) with `sourceType: ORDER_STATUS`.",
  })
  statuses!: OrderStatusAutomationTargetCriteriaItemDto[];
}
