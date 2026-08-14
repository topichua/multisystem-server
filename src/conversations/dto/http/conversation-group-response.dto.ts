import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ConversationGroupResponseDto {
  @ApiProperty({
    description:
      "Workspace group id, or synthetic `-1` for chats with a pending follow-up.",
    example: -1,
  })
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  color: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  createdById: number | null;

  @ApiProperty()
  sortOrder: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Built-in status key: new, processing, archived, spam, pending_follow_up",
    example: "new",
  })
  systemKey?: string | null;

  @ApiProperty({
    description:
      "System groups cannot be deleted; only name/color are editable",
  })
  isSystem: boolean;

  @ApiPropertyOptional({
    description:
      "Number of conversations in this group visible to the current user (with `include_distribution=true`).",
  })
  conversationCount?: number;
}
