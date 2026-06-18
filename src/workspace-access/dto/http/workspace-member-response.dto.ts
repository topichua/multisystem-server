import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class WorkspaceMemberUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional({ nullable: true })
  lastName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "User avatar URL. When set, member `color` is omitted.",
  })
  avatar_src?: string | null;
}

export class WorkspaceMemberResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  roleId: number;

  @ApiProperty()
  roleSlug: string;

  @ApiProperty()
  roleName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  joinedAt: string;

  @ApiProperty()
  updated_at: string;

  @ApiProperty({
    description: "Whether this member can be assigned to conversations.",
  })
  can_be_assigned_to_chat: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Member color for avatar placeholder. Present only when user has no avatar.",
    example: "#6366F1",
  })
  color?: string | null;

  @ApiProperty({ type: WorkspaceMemberUserDto })
  user: WorkspaceMemberUserDto;
}

export class InviteWorkspaceMemberResponseDto {
  @ApiProperty({ enum: ["member", "invitation"] })
  kind: "member" | "invitation";

  @ApiPropertyOptional({ type: WorkspaceMemberResponseDto })
  member?: WorkspaceMemberResponseDto;

  @ApiPropertyOptional({
    description:
      "Present when confirmation is required. Id of the inactive workspace member row.",
  })
  invitationId?: number;

  @ApiPropertyOptional({
    description:
      "Non-production only: raw invitation token for local testing.",
  })
  invitationToken?: string;
}

export class WorkspaceMembersListResponseDto {
  @ApiProperty({ type: [WorkspaceMemberResponseDto] })
  items: WorkspaceMemberResponseDto[];
}
