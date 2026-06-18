import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from "class-validator";
import { INTEGRATION_TYPES } from "../../../integrations/integration-type";

export class IntegrationGrantPermissionsDto {
  @ApiProperty({ enum: ["all", "mine"], example: "mine" })
  @IsIn(["all", "mine"])
  read: "all" | "mine";

  @ApiProperty({ enum: ["all", "mine"], example: "mine" })
  @IsIn(["all", "mine"])
  write: "all" | "mine";

  @ApiPropertyOptional({
    description:
      "Present when the integration is granted. Assign chat responsibility on this integration.",
  })
  @IsOptional()
  @IsBoolean()
  assignResponsibility?: boolean;

  @ApiPropertyOptional({
    description:
      "Present when the integration is granted. Instagram integrations only.",
  })
  @IsOptional()
  @IsBoolean()
  instagramCommentsView?: boolean;

  @ApiPropertyOptional({
    description:
      "Present when the integration is granted. Instagram integrations only.",
  })
  @IsOptional()
  @IsBoolean()
  instagramCommentsWrite?: boolean;
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
  @IsString()
  @IsIn([...INTEGRATION_TYPES])
  integrationType: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  integrationId: number;

  @ApiProperty({ type: IntegrationGrantPermissionsDto })
  @ValidateNested()
  @Type(() => IntegrationGrantPermissionsDto)
  permissions: IntegrationGrantPermissionsDto;
}

export class ReplaceWorkspaceRoleIntegrationGrantsRequestDto {
  @ApiProperty({
    type: [WorkspaceRoleIntegrationGrantInputDto],
    description:
      "Replaces all integration grants for the role. Each grant includes per-integration conversation permissions. " +
      "New integrations are denied until granted here.",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkspaceRoleIntegrationGrantInputDto)
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
