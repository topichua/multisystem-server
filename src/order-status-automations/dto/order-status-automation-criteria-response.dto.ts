import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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

export class OrderStatusAutomationConversationGroupCriteriaItemDto {
  @ApiProperty({
    example: 5,
    description:
      "Conversation group id. Use as `targetConversationGroupId` with " +
      "`actionType: CHANGE_CONVERSATION_GROUP`.",
  })
  id!: number;

  @ApiProperty({ example: "Архів" })
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "archived",
    description: "Built-in system key when present (`new`, `processing`, `archived`, …).",
  })
  systemKey!: string | null;
}

export class OrderStatusAutomationOrderTemplateCriteriaItemDto {
  @ApiProperty({
    example: 7,
    description:
      "Order template id. Use as `targetTemplateId` with `actionType: SEND_MESSAGE`.",
  })
  id!: number;

  @ApiProperty({ example: "Дякуємо за оплату" })
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
      "Workspace order statuses. Use `id` as `targetOrderStatusId` (CHANGE_ORDER_STATUS), " +
      "or as `conditions[].sourceStatus` (string) with `sourceType: ORDER_STATUS`.",
  })
  statuses!: OrderStatusAutomationTargetCriteriaItemDto[];

  @ApiProperty({
    type: [OrderStatusAutomationConversationGroupCriteriaItemDto],
    description:
      "Workspace conversation groups. Use `id` as `targetConversationGroupId` " +
      "with `actionType: CHANGE_CONVERSATION_GROUP`.",
  })
  conversationGroups!: OrderStatusAutomationConversationGroupCriteriaItemDto[];

  @ApiProperty({
    type: [OrderStatusAutomationOrderTemplateCriteriaItemDto],
    description:
      "Order templates. Use `id` as `targetTemplateId` with `actionType: SEND_MESSAGE`.",
  })
  orderTemplates!: OrderStatusAutomationOrderTemplateCriteriaItemDto[];
}
