import { Global, Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  NovaPoshtaIntegration,
  TelegramIntegration,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceRoleIntegrationGrant,
  WorkspaceRoleProductReferenceGrant,
} from "../database/entities";
import { UsersModule } from "../users/users.module";
import { SendgridModule } from "../sendgrid/sendgrid.module";
import { AuthModule } from "../auth/auth.module";
import { PermissionsCatalogController } from "./permissions-catalog.controller";
import { ProductAuthorizationService } from "./product-authorization.service";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspacePermissionsController } from "./workspace-permissions.controller";
import { WorkspacePermissionsService } from "./workspace-permissions.service";
import { WorkspaceMembersController } from "./workspace-members.controller";
import { WorkspaceMembersRegisterController } from "./workspace-members-register.controller";
import { WorkspaceMembersService } from "./workspace-members.service";
import { WorkspaceRoleIntegrationGrantsController } from "./workspace-role-integration-grants.controller";
import { WorkspaceRoleIntegrationGrantsService } from "./workspace-role-integration-grants.service";
import { WorkspaceRoleProductReferenceGrantsController } from "./workspace-role-product-reference-grants.controller";
import { WorkspaceRoleProductReferenceGrantsService } from "./workspace-role-product-reference-grants.service";
import { WorkspaceRolesController } from "./workspace-roles.controller";
import { WorkspaceRolesService } from "./workspace-roles.service";

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstagramIntegration,
      TelegramIntegration,
      NovaPoshtaIntegration,
      Workspace,
      WorkspaceRole,
      WorkspaceRoleIntegrationGrant,
      WorkspaceRoleProductReferenceGrant,
      WorkspaceMember,
      WorkspaceInvitation,
      User,
    ]),
    forwardRef(() => UsersModule),
    SendgridModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [
    PermissionsCatalogController,
    WorkspacePermissionsController,
    WorkspaceRolesController,
    WorkspaceRoleIntegrationGrantsController,
    WorkspaceRoleProductReferenceGrantsController,
    WorkspaceMembersController,
    WorkspaceMembersRegisterController,
  ],
  providers: [
    WorkspaceAccessContextService,
    WorkspacePermissionsService,
    WorkspaceRoleIntegrationGrantsService,
    WorkspaceRoleProductReferenceGrantsService,
    ProductAuthorizationService,
    WorkspaceRolesService,
    WorkspaceMembersService,
  ],
  exports: [
    WorkspaceAccessContextService,
    WorkspacePermissionsService,
    WorkspaceRoleIntegrationGrantsService,
    WorkspaceRoleProductReferenceGrantsService,
    ProductAuthorizationService,
    WorkspaceRolesService,
    WorkspaceMembersService,
  ],
})
export class WorkspaceAccessModule {}
