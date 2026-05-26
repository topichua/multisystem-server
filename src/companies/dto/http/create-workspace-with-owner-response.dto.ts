import { ApiProperty } from "@nestjs/swagger";

export class CreateWorkspaceWithOwnerResponseDto {
  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  workspaceName: string;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  userEmail: string;
}
