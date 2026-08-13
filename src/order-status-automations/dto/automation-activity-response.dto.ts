import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AutomationActionType } from "../../database/entities/automation-action-type.enum";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationExecutionStatus } from "../../database/entities/automation-execution-status.enum";
import { AutomationScheduledJobStatus } from "../../database/entities/automation-scheduled-job-status.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";

export class AutomationHistoryItemDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  automationId!: number;

  @ApiProperty()
  automationName!: string;

  @ApiPropertyOptional({ enum: AutomationActionType, nullable: true })
  actionType!: AutomationActionType | null;

  @ApiProperty()
  orderId!: number;

  @ApiProperty({ enum: AutomationExecutionStatus })
  status!: AutomationExecutionStatus;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty({ enum: AutomationSourceType })
  sourceType!: AutomationSourceType;

  @ApiProperty()
  sourceStatus!: string;

  @ApiPropertyOptional({ nullable: true })
  targetOrderStatusId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  targetConversationGroupId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  targetTemplateId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  conversationId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  messagePreview!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiProperty()
  executedAt!: Date;
}

export class AutomationHistoryListResponseDto {
  @ApiProperty({ type: [AutomationHistoryItemDto] })
  items!: AutomationHistoryItemDto[];

  @ApiProperty()
  total!: number;
}

export class AutomationScheduledItemDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  automationId!: number;

  @ApiProperty()
  automationName!: string;

  @ApiProperty()
  orderId!: number;

  @ApiPropertyOptional({ nullable: true })
  conversationId!: number | null;

  @ApiProperty()
  templateId!: number;

  @ApiProperty({ enum: AutomationScheduledJobStatus })
  status!: AutomationScheduledJobStatus;

  @ApiProperty({ description: "When the message is due to send." })
  runAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  actionDelayValue!: number | null;

  @ApiPropertyOptional({ enum: AutomationDurationUnit, nullable: true })
  actionDelayUnit!: AutomationDurationUnit | null;

  @ApiProperty()
  waitForBusinessHours!: boolean;

  @ApiPropertyOptional({ nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  messagePreview!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sentAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AutomationScheduledListResponseDto {
  @ApiProperty({ type: [AutomationScheduledItemDto] })
  items!: AutomationScheduledItemDto[];

  @ApiProperty()
  total!: number;
}
