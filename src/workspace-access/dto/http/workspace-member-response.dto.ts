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

  @ApiProperty({ type: WorkspaceMemberUserDto })
  user: WorkspaceMemberUserDto;
}

export class InviteWorkspaceMemberResponseDto {
  @ApiProperty({ enum: ["member", "invitation"] })
  kind: "member" | "invitation";

  @ApiPropertyOptional({ type: WorkspaceMemberResponseDto })
  member?: WorkspaceMemberResponseDto;

  @ApiPropertyOptional({
    description: "Present when confirmation is required (non-testing flow)",
  })
  invitationId?: number;

  @ApiPropertyOptional({
    description: "Dev/testing: raw token when invitation created (not for production)",
  })
  invitationToken?: string;
}

export class WorkspaceMembersListResponseDto {
  @ApiProperty({ type: [WorkspaceMemberResponseDto] })
  items: WorkspaceMemberResponseDto[];
}
