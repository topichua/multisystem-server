import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { WorkspaceMemberWorkStatus } from "../../../database/entities";

export class ConversationResponsibleMemberItemDto {
  @ApiProperty({
    description:
      "Workspace member id (matches conversation `responsible_member_id`).",
  })
  id!: number;

  @ApiProperty()
  userId!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  avatar!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Member color when user has no avatar.",
  })
  color?: string | null;

  @ApiProperty({
    enum: WorkspaceMemberWorkStatus,
    description: "Member-selected work availability status.",
  })
  work_status!: WorkspaceMemberWorkStatus;
}

export class ConversationResponsibleMembersResponseDto {
  @ApiProperty({ type: [ConversationResponsibleMemberItemDto] })
  items!: ConversationResponsibleMemberItemDto[];
}
