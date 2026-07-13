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
    description: "Workspace order status id. Use as `targetOrderStatusId` when creating an automation.",
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
      "Workspace order statuses. Use `id` as `targetOrderStatusId` (automation action target).",
  })
  statuses!: OrderStatusAutomationTargetCriteriaItemDto[];
}
