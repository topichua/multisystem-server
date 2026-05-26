import { ApiProperty } from "@nestjs/swagger";

export class WorkspaceRoleResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class WorkspaceRolesListResponseDto {
  @ApiProperty({ type: [WorkspaceRoleResponseDto] })
  items: WorkspaceRoleResponseDto[];
}
