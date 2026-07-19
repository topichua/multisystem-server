import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ConversationEventResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  conversationId: number;

  @ApiProperty({
    description:
      "Event type: conversation_created, group_changed, responsible_changed, order_created",
  })
  type: string;

  @ApiPropertyOptional({ nullable: true })
  actorId: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: "object",
    additionalProperties: true,
  })
  payload: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: Date;
}

export class ConversationEventsListResponseDto {
  @ApiProperty({ type: [ConversationEventResponseDto] })
  items: ConversationEventResponseDto[];
}
