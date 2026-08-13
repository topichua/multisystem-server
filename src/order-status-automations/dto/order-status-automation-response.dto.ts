import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AutomationActionType } from "../../database/entities/automation-action-type.enum";
import { AutomationConditionOperator } from "../../database/entities/automation-condition-operator.enum";
import { AutomationConditionType } from "../../database/entities/automation-condition-type.enum";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationOrigin } from "../../database/entities/automation-origin.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";
import { OrderStatusCategory } from "../../database/entities/order-status-category.enum";

export class OrderStatusAutomationTargetStatusDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: OrderStatusCategory })
  category!: OrderStatusCategory;

  @ApiProperty()
  color!: string;
}

export class OrderStatusAutomationTargetConversationGroupDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "System key when built-in (`new`, `processing`, `archived`, …).",
  })
  systemKey!: string | null;
}

export class OrderStatusAutomationTargetTemplateDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: "order" })
  type!: string;
}

export class OrderStatusAutomationConditionResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: AutomationSourceType })
  sourceType!: AutomationSourceType;

  @ApiProperty({ example: "at_branch" })
  sourceStatus!: string;

  @ApiProperty({
    enum: AutomationConditionOperator,
    description: "`EQ` equals status (default); `NEQ` not equals status.",
  })
  operator!: AutomationConditionOperator;

  @ApiPropertyOptional({
    nullable: true,
    description: "Null for immediate conditions.",
  })
  durationValue!: number | null;

  @ApiPropertyOptional({
    enum: AutomationDurationUnit,
    nullable: true,
    description: "Null for immediate conditions.",
  })
  durationUnit!: AutomationDurationUnit | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "3 дн",
    description: "Human-readable delay for this condition.",
  })
  durationLabel!: string | null;

  @ApiProperty({ description: "Display order of the condition within the rule." })
  sortOrder!: number;
}

export class OrderStatusAutomationResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  workspaceId!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    enum: AutomationConditionType,
    description:
      "How conditions combine: `OR` = at least one must pass; `AND` = all must pass. " +
      "Preferred response field (camelCase).",
  })
  conditionType!: AutomationConditionType;

  @ApiProperty({
    enum: AutomationConditionType,
    description: "Snake_case alias of `conditionType` (legacy clients).",
  })
  condition_type!: AutomationConditionType;

  @ApiProperty({
    type: [OrderStatusAutomationConditionResponseDto],
    description: "Trigger conditions combined by `conditionType`.",
  })
  conditions!: OrderStatusAutomationConditionResponseDto[];

  @ApiProperty({
    enum: AutomationActionType,
    example: AutomationActionType.change_order_status,
  })
  actionType!: AutomationActionType;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set for CHANGE_ORDER_STATUS.",
  })
  targetOrderStatusId!: number | null;

  @ApiPropertyOptional({
    type: OrderStatusAutomationTargetStatusDto,
    nullable: true,
    description: "Set for CHANGE_ORDER_STATUS.",
  })
  targetOrderStatus!: OrderStatusAutomationTargetStatusDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set for CHANGE_CONVERSATION_GROUP.",
  })
  targetConversationGroupId!: number | null;

  @ApiPropertyOptional({
    type: OrderStatusAutomationTargetConversationGroupDto,
    nullable: true,
    description: "Set for CHANGE_CONVERSATION_GROUP.",
  })
  targetConversationGroup!: OrderStatusAutomationTargetConversationGroupDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set for SEND_MESSAGE (order template id).",
  })
  targetTemplateId!: number | null;

  @ApiPropertyOptional({
    type: OrderStatusAutomationTargetTemplateDto,
    nullable: true,
    description: "Set for SEND_MESSAGE.",
  })
  targetTemplate!: OrderStatusAutomationTargetTemplateDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "SEND_MESSAGE action delay value.",
  })
  actionDelayValue!: number | null;

  @ApiPropertyOptional({
    enum: AutomationDurationUnit,
    nullable: true,
    description: "SEND_MESSAGE action delay unit.",
  })
  actionDelayUnit!: AutomationDurationUnit | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Human-readable action delay (e.g. `2 год`).",
  })
  actionDelayLabel!: string | null;

  @ApiProperty({
    description: "SEND_MESSAGE: wait for workspace work schedule after delay.",
  })
  waitForBusinessHours!: boolean;

  @ApiProperty({ enum: AutomationOrigin })
  origin!: AutomationOrigin;

  @ApiPropertyOptional({ nullable: true })
  templateKey!: string | null;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({ nullable: true })
  createdById!: number | null;

  @ApiPropertyOptional({ nullable: true })
  updatedById!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class OrderStatusAutomationsListResponseDto {
  @ApiProperty({ type: [OrderStatusAutomationResponseDto] })
  items!: OrderStatusAutomationResponseDto[];

  @ApiProperty()
  total!: number;
}
