import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AutomationActionType } from "../../database/entities/automation-action-type.enum";
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

export class OrderStatusAutomationConditionResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: AutomationSourceType })
  sourceType!: AutomationSourceType;

  @ApiProperty({ example: "at_branch" })
  sourceStatus!: string;

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
    type: [OrderStatusAutomationConditionResponseDto],
    description: "OR trigger conditions. Each may have its own delay.",
  })
  conditions!: OrderStatusAutomationConditionResponseDto[];

  @ApiProperty({
    enum: AutomationActionType,
    example: AutomationActionType.change_order_status,
  })
  actionType!: AutomationActionType;

  @ApiProperty()
  targetOrderStatusId!: number;

  @ApiProperty({ type: OrderStatusAutomationTargetStatusDto })
  targetOrderStatus!: OrderStatusAutomationTargetStatusDto;

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

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
