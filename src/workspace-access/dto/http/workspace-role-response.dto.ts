import { ApiProperty } from "@nestjs/swagger";
import { ResolvedUserPermissionsResponseDto } from "./resolved-user-permissions-response.dto";

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

  @ApiProperty({
    example: { "orders.visibility": "mine" },
  })
  permissionOptions: Record<string, string>;

  @ApiProperty({
    example: {},
    description: "Deprecated — use integration grants for per-integration permissions.",
  })
  permissionOptionLists: Record<string, string[]>;

  @ApiProperty({
    type: ResolvedUserPermissionsResponseDto,
    description: "Typed resolved permissions for this role.",
  })
  resolved: ResolvedUserPermissionsResponseDto;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class WorkspaceRolesListResponseDto {
  @ApiProperty({ type: [WorkspaceRoleResponseDto] })
  items: WorkspaceRoleResponseDto[];
}
