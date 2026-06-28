import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { WorkspaceMemberStatus } from "../../database/entities";

export class RegistrationUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: "date-time" })
  emailVerifiedAt: Date | null;
}

export class RegistrationWorkspaceDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description: "User id of the workspace owner (`workspace.owner_id`).",
  })
  ownerId: number;
}

export class RegistrationMemberDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty({ example: "owner" })
  roleSlug: string;

  @ApiProperty({ enum: WorkspaceMemberStatus })
  status: WorkspaceMemberStatus;
}

export class ConfirmRegistrationResponseDto {
  @ApiProperty({ type: RegistrationUserDto })
  user: RegistrationUserDto;

  @ApiProperty({ type: RegistrationWorkspaceDto })
  workspace: RegistrationWorkspaceDto;

  @ApiProperty({
    type: RegistrationMemberDto,
    description: "Active workspace member row with role `owner`.",
  })
  member: RegistrationMemberDto;
}
