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
}
