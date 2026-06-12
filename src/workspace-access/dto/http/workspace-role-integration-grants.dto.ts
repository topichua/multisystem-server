import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { INTEGRATION_TYPES } from "../../../integrations/integration-type";

export class IntegrationGrantPermissionsDto {
  @ApiProperty({ enum: ["all", "mine"], example: "mine" })
  read: "all" | "mine";

  @ApiProperty({ enum: ["all", "mine"], example: "mine" })
  write: "all" | "mine";

  @ApiProperty({ description: "Assign chat responsibility on this integration." })
  assignResponsibility: boolean;

  @ApiProperty({
    description: "Instagram integrations only; ignored for Telegram grants.",
  })
  instagramCommentsView: boolean;

  @ApiProperty({
    description: "Instagram integrations only; ignored for Telegram grants.",
  })
  instagramCommentsWrite: boolean;
}

export class WorkspaceRoleIntegrationGrantItemDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  integrationType: string;

  @ApiProperty()
  integrationId: number;

  @ApiProperty({ example: "My Instagram Page" })
  integrationName: string;

  @ApiProperty({ type: IntegrationGrantPermissionsDto })
  permissions: IntegrationGrantPermissionsDto;
}

export class WorkspaceRoleIntegrationGrantsResponseDto {
  @ApiProperty()
  roleId: number;

  @ApiProperty({ type: [WorkspaceRoleIntegrationGrantItemDto] })
  grants: WorkspaceRoleIntegrationGrantItemDto[];
}

export class WorkspaceRoleIntegrationGrantInputDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  integrationType: string;

  @ApiProperty()
  integrationId: number;

  @ApiProperty({ type: IntegrationGrantPermissionsDto })
  permissions: IntegrationGrantPermissionsDto;
}

export class ReplaceWorkspaceRoleIntegrationGrantsRequestDto {
  @ApiProperty({
    type: [WorkspaceRoleIntegrationGrantInputDto],
    description:
      "Replaces all integration grants for the role. Each grant includes per-integration conversation permissions. " +
      "New integrations are denied until granted here.",
  })
  grants: WorkspaceRoleIntegrationGrantInputDto[];
}

export class IntegrationGrantPermissionCatalogItemDto {
  @ApiProperty({ example: "read" })
  key: string;

  @ApiProperty({ enum: ["boolean", "option"] })
  type: "boolean" | "option";

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  default?: string | boolean;

  @ApiPropertyOptional({ type: [Object] })
  options?: Array<{ value: string; label: string }>;

  @ApiPropertyOptional({
    type: [String],
    description: "When set, permission applies only to these integration types.",
  })
  integrationTypes?: string[];
}
