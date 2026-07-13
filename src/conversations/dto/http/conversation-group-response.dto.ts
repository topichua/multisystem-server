import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ConversationGroupResponseDto {
  @ApiProperty()
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
    description: "Built-in status key: new, processing, archived, spam",
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
