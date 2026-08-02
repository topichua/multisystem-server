import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  INSTAGRAM_SYNCHRONIZATION_PHASES,
  INSTAGRAM_SYNCHRONIZATION_STATUSES,
  type InstagramSynchronizationPhase,
  type InstagramSynchronizationStatus,
} from "../../database/entities/instagram-synchronization-status";

export class InstagramSynchronizationDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  integrationId: number;

  @ApiProperty({ enum: INSTAGRAM_SYNCHRONIZATION_STATUSES })
  status: InstagramSynchronizationStatus;

  @ApiProperty({ enum: INSTAGRAM_SYNCHRONIZATION_PHASES })
  phase: InstagramSynchronizationPhase;

  @ApiProperty({
    description: "Import messages/conversations with activity on or after this time.",
  })
  sinceAt: Date;

  @ApiProperty({ example: 7 })
  windowDays: number;

  @ApiProperty({ description: "Conversations in scope (updated within window)." })
  conversationsTotal: number;

  @ApiProperty({ description: "Conversations fully processed (upsert + messages)." })
  conversationsProcessed: number;

  @ApiProperty()
  conversationsFailed: number;

  @ApiProperty({ description: "Messages upserted into conversation_messages." })
  messagesImported: number;

  @ApiPropertyOptional({
    nullable: true,
    description: "0–100 progress percent based on conversationsProcessed/total.",
  })
  progressPercent: number | null;

  @ApiPropertyOptional({ nullable: true })
  error: string | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  finishedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class InstagramSynchronizationListResponseDto {
  @ApiProperty({ type: [InstagramSynchronizationDto] })
  items: InstagramSynchronizationDto[];
}
