import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConversationFollowUpStatus } from "../../../database/entities/conversation-follow-up-status.enum";

export class ConversationFollowUpResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  workspaceId!: number;

  @ApiProperty()
  conversationId!: number;

  @ApiProperty({ enum: ConversationFollowUpStatus })
  status!: ConversationFollowUpStatus;

  @ApiProperty()
  scheduledAt!: Date;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ nullable: true })
  templateId!: number | null;

  @ApiProperty()
  cancelOnReply!: boolean;

  @ApiPropertyOptional({ nullable: true })
  previousGroupId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  createdById!: number | null;

  @ApiPropertyOptional({ nullable: true })
  updatedById!: number | null;

  @ApiPropertyOptional({ nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sentAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ConversationFollowUpOptionalResponseDto {
  @ApiPropertyOptional({
    type: ConversationFollowUpResponseDto,
    nullable: true,
    description: "Pending follow-up for this conversation, or null.",
  })
  followUp!: ConversationFollowUpResponseDto | null;
}
