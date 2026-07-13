import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
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
import { AutomationActionType } from "../../database/entities/automation-action-type.enum";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";

export class OrderStatusAutomationConditionDto {
  @ApiProperty({
    enum: AutomationSourceType,
    example: AutomationSourceType.delivery_status,
    description: "DELIVERY_STATUS or PAYMENT_STATUS.",
  })
  @IsEnum(AutomationSourceType)
  sourceType!: AutomationSourceType;

  @ApiProperty({
    example: "at_branch",
    description:
      "Delivery: pending, waybill_created, shipped, at_branch, delivered, delivery_failed, returned. " +
      "Payment: unpaid, partial, paid, overpaid, refunded. " +
      "See GET /automation_rule/criteria for labels.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceStatus!: string;

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

  @ApiProperty({
    type: [OrderStatusAutomationConditionDto],
    description:
      "OR trigger conditions. Each condition may have its own optional delay.",
    example: [
      {
        sourceType: "DELIVERY_STATUS",
        sourceStatus: "at_branch",
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
    description: "V1 supports only CHANGE_ORDER_STATUS.",
  })
  @IsEnum(AutomationActionType)
  actionType: AutomationActionType = AutomationActionType.change_order_status;

  @ApiProperty({ example: 12, description: "Workspace order status id to apply." })
  @IsInt()
  @IsPositive()
  targetOrderStatusId!: number;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetOrderStatusId?: number;
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
