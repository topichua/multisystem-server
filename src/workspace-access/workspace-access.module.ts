import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Company,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "../database/entities";
import { UsersModule } from "../users/users.module";
import { PermissionsCatalogController } from "./permissions-catalog.controller";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspaceMembersController } from "./workspace-members.controller";
import { WorkspaceMembersService } from "./workspace-members.service";
import { WorkspaceRolesController } from "./workspace-roles.controller";
import { WorkspaceRolesService } from "./workspace-roles.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Workspace,
      WorkspaceRole,
      WorkspaceMember,
      WorkspaceInvitation,
      User,
    ]),
    UsersModule,
  ],
  controllers: [
    PermissionsCatalogController,
    WorkspaceRolesController,
    WorkspaceMembersController,
  ],
  providers: [
    WorkspaceAccessContextService,
    WorkspaceRolesService,
    WorkspaceMembersService,
  ],
  exports: [WorkspaceRolesService, WorkspaceMembersService],
})
export class WorkspaceAccessModule {}
