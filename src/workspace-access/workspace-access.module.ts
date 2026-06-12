import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  TelegramIntegration,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceRoleIntegrationGrant,
} from "../database/entities";
import { UsersModule } from "../users/users.module";
import { PermissionsCatalogController } from "./permissions-catalog.controller";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspacePermissionsController } from "./workspace-permissions.controller";
import { WorkspacePermissionsService } from "./workspace-permissions.service";
import { WorkspaceMembersController } from "./workspace-members.controller";
import { WorkspaceMembersService } from "./workspace-members.service";
import { WorkspaceRoleIntegrationGrantsController } from "./workspace-role-integration-grants.controller";
import { WorkspaceRoleIntegrationGrantsService } from "./workspace-role-integration-grants.service";
import { WorkspaceRolesController } from "./workspace-roles.controller";
import { WorkspaceRolesService } from "./workspace-roles.service";

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstagramIntegration,
      TelegramIntegration,
      Workspace,
      WorkspaceRole,
      WorkspaceRoleIntegrationGrant,
      WorkspaceMember,
      WorkspaceInvitation,
      User,
    ]),
    UsersModule,
  ],
  controllers: [
    PermissionsCatalogController,
    WorkspacePermissionsController,
    WorkspaceRolesController,
    WorkspaceRoleIntegrationGrantsController,
    WorkspaceMembersController,
  ],
  providers: [
    WorkspaceAccessContextService,
    WorkspacePermissionsService,
    WorkspaceRoleIntegrationGrantsService,
    WorkspaceRolesService,
    WorkspaceMembersService,
  ],
  exports: [
    WorkspaceAccessContextService,
    WorkspacePermissionsService,
    WorkspaceRoleIntegrationGrantsService,
    WorkspaceRolesService,
    WorkspaceMembersService,
  ],
})
export class WorkspaceAccessModule {}
