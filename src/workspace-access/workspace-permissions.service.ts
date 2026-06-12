import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WorkspaceMember, WorkspaceMemberStatus } from "../database/entities";
import { normalizePermissionOptionLists } from "./permissions/permission-option-lists.util";
import { normalizePermissionOptions } from "./permissions/permission-options.util";
import {
  resolveOwnerPermissions,
  resolveRolePermissions,
} from "./permissions/permissions-resolver";
import type { ResolvedUserPermissions } from "./permissions/resolved-permissions.type";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspaceRoleIntegrationGrantsService } from "./workspace-role-integration-grants.service";

@Injectable()
export class WorkspacePermissionsService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly integrationGrants: WorkspaceRoleIntegrationGrantsService,
  ) {}

  async getResolvedForUser(
    userId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<ResolvedUserPermissions> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
      workspaceIdParam,
    );
    if (workspace.ownerId === userId) {
      return resolveOwnerPermissions(
        await this.integrationGrants.listResolvedGrantsForWorkspace(
          workspace.id,
        ),
      );
    }

    const member = await this.memberRepo.findOne({
      where: {
        workspaceId: workspace.id,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: { role: true },
    });
    if (!member?.role) {
      return resolveRolePermissions({
        permissions: [],
        permissionOptions: {},
        permissionOptionLists: {},
        integrationGrants: [],
      });
    }

    const permissionOptions = normalizePermissionOptions(
      member.role.permissionOptions,
    );
    return resolveRolePermissions({
      permissions: member.role.permissions,
      permissionOptions,
      permissionOptionLists: normalizePermissionOptionLists(
        permissionOptions,
        member.role.permissionOptionLists,
      ),
      integrationGrants:
        await this.integrationGrants.resolveIntegrationGrantsForRole(
          workspace.id,
          member.role.id,
          member.role.permissions,
        ),
    });
  }
}
