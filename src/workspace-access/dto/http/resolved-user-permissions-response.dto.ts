import { ApiProperty } from "@nestjs/swagger";
import { INTEGRATION_TYPES } from "../../../integrations/integration-type";

export class ResolvedProductsPermissionsDto {
  @ApiProperty()
  view: boolean;

  @ApiProperty()
  createAndEdit: boolean;

  @ApiProperty()
  customFieldsManagement: boolean;

  @ApiProperty()
  categoryManagement: boolean;

  @ApiProperty()
  aiImport: boolean;

  @ApiProperty()
  inventoryView: boolean;

  @ApiProperty()
  inventoryManage: boolean;
}

export class ResolvedOrdersPermissionsDto {
  @ApiProperty()
  view: boolean;

  @ApiProperty({ enum: ["all", "mine"] })
  visibility: "all" | "mine";

  @ApiProperty()
  create: boolean;

  @ApiProperty()
  editStatus: boolean;

  @ApiProperty()
  edit: boolean;
}

export class ResolvedConversationsPermissionsDto {
  @ApiProperty({
    description:
      "Full conversation access on every workspace integration. New integrations are included automatically.",
  })
  fullAccess: boolean;
}

export class ResolvedClientsPermissionsDto {
  @ApiProperty()
  viewList: boolean;
}

export class ResolvedWorkspaceMembersPermissionsDto {
  @ApiProperty()
  view: boolean;

  @ApiProperty()
  invite: boolean;

  @ApiProperty()
  delete: boolean;
}

export class ResolvedWorkspacePermissionsDto {
  @ApiProperty()
  chatGroupsManagement: boolean;

  @ApiProperty()
  templatesManagement: boolean;

  @ApiProperty()
  integrations: boolean;

  @ApiProperty()
  rolesManagement: boolean;

  @ApiProperty({ type: ResolvedWorkspaceMembersPermissionsDto })
  members: ResolvedWorkspaceMembersPermissionsDto;
}

export class ResolvedAnalyticsPermissionsDto {
  @ApiProperty()
  view: boolean;
}

export class ResolvedIntegrationGrantItemDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  integrationType: string;

  @ApiProperty()
  integrationId: number;

  @ApiProperty({ enum: ["all", "mine"] })
  read: "all" | "mine";

  @ApiProperty({ enum: ["all", "mine"] })
  write: "all" | "mine";

  @ApiProperty()
  assignResponsibility: boolean;

  @ApiProperty()
  instagramCommentsView: boolean;

  @ApiProperty()
  instagramCommentsWrite: boolean;
}

export class ResolvedUserPermissionsResponseDto {
  @ApiProperty()
  isOwner: boolean;

  @ApiProperty({ type: ResolvedProductsPermissionsDto })
  products: ResolvedProductsPermissionsDto;

  @ApiProperty({ type: ResolvedOrdersPermissionsDto })
  orders: ResolvedOrdersPermissionsDto;

  @ApiProperty({ type: ResolvedConversationsPermissionsDto })
  conversations: ResolvedConversationsPermissionsDto;

  @ApiProperty({ type: ResolvedClientsPermissionsDto })
  clients: ResolvedClientsPermissionsDto;

  @ApiProperty({ type: ResolvedWorkspacePermissionsDto })
  workspace: ResolvedWorkspacePermissionsDto;

  @ApiProperty({ type: ResolvedAnalyticsPermissionsDto })
  analytics: ResolvedAnalyticsPermissionsDto;

  @ApiProperty({
    type: [ResolvedIntegrationGrantItemDto],
    description:
      "Per-integration grants with conversation permissions. Missing integration = no access.",
  })
  integrationGrants: ResolvedIntegrationGrantItemDto[];
}
