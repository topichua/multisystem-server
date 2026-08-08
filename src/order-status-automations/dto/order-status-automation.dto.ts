import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { AutomationActionType } from "../../database/entities/automation-action-type.enum";
import { AutomationConditionOperator } from "../../database/entities/automation-condition-operator.enum";
import { AutomationConditionType } from "../../database/entities/automation-condition-type.enum";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";

/** Prefer camelCase; keep snake_case for older clients. */
export function resolveConditionType(
  dto: {
    conditionType?: AutomationConditionType;
    condition_type?: AutomationConditionType;
  },
  fallback?: AutomationConditionType,
): AutomationConditionType | undefined {
  return dto.conditionType ?? dto.condition_type ?? fallback;
}

export class OrderStatusAutomationConditionDto {
  @ApiProperty({
    enum: AutomationSourceType,
    example: AutomationSourceType.delivery_status,
    description:
      "`DELIVERY_STATUS` / `PAYMENT_STATUS` (codes) or `ORDER_STATUS` (workspace order status id as string).",
  })
  @IsEnum(AutomationSourceType)
  sourceType!: AutomationSourceType;

  @ApiProperty({
    example: "at_branch",
    description:
      "DELIVERY_STATUS: pending, waybill_created, shipped, at_branch, delivered, delivery_failed, returned. " +
      "PAYMENT_STATUS: unpaid, partial, paid, overpaid, refunded. " +
      "ORDER_STATUS: workspace order status **id** as string (e.g. \"29\" from GET /automation_rule/criteria `statuses`). " +
      "See GET /automation_rule/criteria for options.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceStatus!: string;

  @ApiPropertyOptional({
    enum: AutomationConditionOperator,
    default: AutomationConditionOperator.eq,
    description:
      "`EQ` (default) — status equals `sourceStatus`. " +
      "`NEQ` — status is anything except `sourceStatus`. " +
      "Aliases: EQUALS, NOT_EQUALS, !=.",
    example: AutomationConditionOperator.eq,
  })
  @IsOptional()
  @IsString()
  operator?: AutomationConditionOperator | string;

  @ApiPropertyOptional({
    nullable: true,
    example: 3,
    description:
      "Optional delay for this condition. Required together with durationUnit. Omit both for immediate rules.",
  })
  @ValidateIf((o) => o.durationUnit != null)
  @IsInt()
  @IsPositive()
  durationValue?: number | null;

  @ApiPropertyOptional({
    enum: AutomationDurationUnit,
    nullable: true,
    example: AutomationDurationUnit.days,
    description: "MINUTES, HOURS, or DAYS. Required together with durationValue.",
  })
  @ValidateIf((o) => o.durationValue != null)
  @IsEnum(AutomationDurationUnit)
  durationUnit?: AutomationDurationUnit | null;
}

export class CreateOrderStatusAutomationDto {
  @ApiProperty({ example: "At branch more than 3 days" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: AutomationConditionType,
    default: AutomationConditionType.or,
    description:
      "How conditions combine: `OR` = at least one must pass; `AND` = all must pass. " +
      "Preferred body field (camelCase). Defaults to `OR`.",
  })
  @IsOptional()
  @IsEnum(AutomationConditionType)
  conditionType?: AutomationConditionType;

  @ApiPropertyOptional({
    enum: AutomationConditionType,
    default: AutomationConditionType.or,
    description:
      "Snake_case alias of `conditionType` (legacy clients). Prefer `conditionType`.",
  })
  @IsOptional()
  @IsEnum(AutomationConditionType)
  condition_type?: AutomationConditionType;

  @ApiProperty({
    type: [OrderStatusAutomationConditionDto],
    description:
      "Trigger conditions combined by `conditionType`. Each may have its own optional delay and operator.",
    example: [
      {
        sourceType: "DELIVERY_STATUS",
        sourceStatus: "at_branch",
        operator: "EQ",
        durationValue: 3,
        durationUnit: "DAYS",
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderStatusAutomationConditionDto)
  conditions!: OrderStatusAutomationConditionDto[];

  @ApiProperty({
    enum: AutomationActionType,
    default: AutomationActionType.change_order_status,
    example: AutomationActionType.change_order_status,
    description:
      "`CHANGE_ORDER_STATUS` — set order status (`targetOrderStatusId`). " +
      "`CHANGE_CONVERSATION_GROUP` — move order's linked chat to a group (`targetConversationGroupId`), e.g. archive.",
  })
  @IsEnum(AutomationActionType)
  actionType: AutomationActionType = AutomationActionType.change_order_status;

  @ApiPropertyOptional({
    example: 12,
    description:
      "Required when `actionType` is `CHANGE_ORDER_STATUS`. Workspace order status id.",
  })
  @ValidateIf(
    (o: CreateOrderStatusAutomationDto) =>
      (o.actionType ?? AutomationActionType.change_order_status) ===
      AutomationActionType.change_order_status,
  )
  @IsInt()
  @IsPositive()
  targetOrderStatusId?: number;

  @ApiPropertyOptional({
    example: 5,
    description:
      "Required when `actionType` is `CHANGE_CONVERSATION_GROUP`. " +
      "Workspace conversation group id (from criteria `conversationGroups`, e.g. archived).",
  })
  @ValidateIf(
    (o: CreateOrderStatusAutomationDto) =>
      o.actionType === AutomationActionType.change_conversation_group,
  )
  @IsInt()
  @IsPositive()
  targetConversationGroupId?: number;
}

export class UpdateOrderStatusAutomationDto {
  @ApiPropertyOptional({ example: "At branch more than 3 days" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: AutomationConditionType,
    description:
      "How conditions combine: `OR` = at least one must pass; `AND` = all must pass.",
  })
  @IsOptional()
  @IsEnum(AutomationConditionType)
  conditionType?: AutomationConditionType;

  @ApiPropertyOptional({
    enum: AutomationConditionType,
    description: "Snake_case alias of `conditionType` (legacy).",
  })
  @IsOptional()
  @IsEnum(AutomationConditionType)
  condition_type?: AutomationConditionType;

  @ApiPropertyOptional({
    type: [OrderStatusAutomationConditionDto],
    description: "Replaces all existing conditions when provided.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderStatusAutomationConditionDto)
  conditions?: OrderStatusAutomationConditionDto[];

  @ApiPropertyOptional({ enum: AutomationActionType })
  @IsOptional()
  @IsEnum(AutomationActionType)
  actionType?: AutomationActionType;

  @ApiPropertyOptional({
    description: "Required for CHANGE_ORDER_STATUS (when that action is selected).",
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetOrderStatusId?: number;

  @ApiPropertyOptional({
    description:
      "Required for CHANGE_CONVERSATION_GROUP (when that action is selected).",
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetConversationGroupId?: number;
}

export class SetOrderStatusAutomationActiveDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}

export class ListOrderStatusAutomationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: AutomationSourceType,
    description: "Filter automations that include a condition of this source type.",
  })
  @IsOptional()
  @IsEnum(AutomationSourceType)
  sourceType?: AutomationSourceType;
}
