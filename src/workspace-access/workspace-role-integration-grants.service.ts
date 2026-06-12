import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  INTEGRATION_TYPES,
  type IntegrationType,
} from "../integrations/integration-type";
import {
  InstagramIntegration,
  TelegramIntegration,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
  WorkspaceRoleIntegrationGrant,
  type WorkspaceRoleIntegrationGrantType,
} from "../database/entities";
import type {
  ReplaceWorkspaceRoleIntegrationGrantsRequestDto,
  WorkspaceRoleIntegrationGrantItemDto,
  WorkspaceRoleIntegrationGrantsResponseDto,
} from "./dto/http/workspace-role-integration-grants.dto";
import {
  normalizeIntegrationGrantPermissions,
  type IntegrationGrantConversationPermissions,
} from "./permissions/integration-grant-permissions";
import { normalizePermissionOptionLists } from "./permissions/permission-option-lists.util";
import { normalizePermissionOptions } from "./permissions/permission-options.util";
import {
  getIntegrationGrant,
  hasBooleanPermission,
  resolveRolePermissions,
} from "./permissions/permissions-resolver";
import type { ResolvedIntegrationGrant } from "./permissions/resolved-permissions.type";
import type { ResolvedUserPermissions } from "./permissions/resolved-permissions.type";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";

type NormalizedGrantInput = {
  integrationType: WorkspaceRoleIntegrationGrantType;
  integrationId: number;
  permissions: IntegrationGrantConversationPermissions;
};

@Injectable()
export class WorkspaceRoleIntegrationGrantsService {
  constructor(
    @InjectRepository(WorkspaceRoleIntegrationGrant)
    private readonly grantRepo: Repository<WorkspaceRoleIntegrationGrant>,
    @InjectRepository(WorkspaceRole)
    private readonly roleRepo: Repository<WorkspaceRole>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(InstagramIntegration)
    private readonly instagramRepo: Repository<InstagramIntegration>,
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async listForRole(
    actorUserId: number,
    roleId: number,
    appRole?: string,
  ): Promise<WorkspaceRoleIntegrationGrantsResponseDto> {
    const role = await this.requireRole(roleId);
    await this.assertCanManageIntegrationGrants(
      actorUserId,
      role.workspaceId,
      appRole,
    );
    const grants = await this.grantRepo.find({
      where: { roleId: role.id },
      order: { integrationType: "ASC", integrationId: "ASC" },
    });
    return {
      roleId: role.id,
      grants: await this.enrichGrants(role.workspaceId, grants),
    };
  }

  async replaceForRole(
    actorUserId: number,
    roleId: number,
    dto: ReplaceWorkspaceRoleIntegrationGrantsRequestDto,
    appRole?: string,
  ): Promise<WorkspaceRoleIntegrationGrantsResponseDto> {
    const role = await this.requireRole(roleId);
    await this.assertCanManageIntegrationGrants(
      actorUserId,
      role.workspaceId,
      appRole,
    );

    const normalized = this.normalizeGrantInputs(dto.grants ?? []);
    await this.assertIntegrationsExistInWorkspace(role.workspaceId, normalized);

    await this.grantRepo.delete({ roleId: role.id });
    if (normalized.length > 0) {
      await this.grantRepo.save(
        normalized.map((grant) =>
          this.grantRepo.create({
            workspaceId: role.workspaceId,
            roleId: role.id,
            integrationType: grant.integrationType,
            integrationId: grant.integrationId,
            conversationsReadScope: grant.permissions.read,
            conversationsWriteScope: grant.permissions.write,
            conversationsAssignResponsibility:
              grant.permissions.assignResponsibility,
            instagramCommentsRead: grant.permissions.instagramCommentsView,
            instagramCommentsWrite: grant.permissions.instagramCommentsWrite,
            grantedByUserId: actorUserId,
          }),
        ),
      );
    }

    return this.listForRole(actorUserId, role.id, appRole);
  }

  async removeForIntegration(
    integrationType: IntegrationType,
    integrationId: number,
  ): Promise<void> {
    await this.grantRepo.delete({ integrationType, integrationId });
  }

  hasConversationsFullAccess(permissions: string[] | null | undefined): boolean {
    return (permissions ?? []).some(
      (key) => key.trim() === "conversations.full_access",
    );
  }

  async resolveIntegrationGrantsForRole(
    workspaceId: number,
    roleId: number,
    permissions: string[] | null | undefined,
  ): Promise<ResolvedIntegrationGrant[]> {
    if (this.hasConversationsFullAccess(permissions)) {
      return this.listResolvedGrantsForWorkspace(workspaceId);
    }
    return this.listResolvedGrantsForRole(roleId);
  }

  async listResolvedGrantsForRole(
    roleId: number,
  ): Promise<ResolvedIntegrationGrant[]> {
    const rows = await this.grantRepo.find({
      where: { roleId },
      order: { integrationType: "ASC", integrationId: "ASC" },
    });
    return rows.map((row) => this.toResolvedGrant(row));
  }

  async listResolvedGrantsForWorkspace(
    workspaceId: number,
  ): Promise<ResolvedIntegrationGrant[]> {
    const instagram = await this.instagramRepo.find({
      where: { workspaceId },
      order: { id: "ASC" },
    });
    const telegram = await this.telegramRepo.find({
      where: { workspaceId },
      order: { id: "ASC" },
    });
    const grants: ResolvedIntegrationGrant[] = [];
    for (const row of instagram) {
      grants.push({
        integrationType: "instagram",
        integrationId: row.id,
        read: "all",
        write: "all",
        assignResponsibility: true,
        instagramCommentsView: true,
        instagramCommentsWrite: true,
      });
    }
    for (const row of telegram) {
      grants.push({
        integrationType: "telegram",
        integrationId: row.id,
        read: "all",
        write: "all",
        assignResponsibility: true,
        instagramCommentsView: false,
        instagramCommentsWrite: false,
      });
    }
    return grants;
  }

  canAccessIntegration(
    resolved: ResolvedUserPermissions,
    integrationType: IntegrationType,
    integrationId: number,
  ): boolean {
    return getIntegrationGrant(resolved, integrationType, integrationId) != null;
  }

  private async requireRole(roleId: number): Promise<WorkspaceRole> {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException("Workspace role not found");
    }
    return role;
  }

  private async assertCanManageIntegrationGrants(
    actorUserId: number,
    workspaceId: number,
    appRole?: string,
  ): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceOwner(
      actorUserId,
      workspaceId,
      appRole,
    );
    if (workspace.ownerId === actorUserId) {
      return;
    }

    const member = await this.memberRepo.findOne({
      where: {
        workspaceId,
        userId: actorUserId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: { role: true },
    });
    if (!member?.role) {
      throw new ForbiddenException("Workspace membership required");
    }

    const permissionOptions = normalizePermissionOptions(
      member.role.permissionOptions,
    );
    const resolved = resolveRolePermissions({
      permissions: member.role.permissions,
      permissionOptions,
      permissionOptionLists: normalizePermissionOptionLists(
        permissionOptions,
        member.role.permissionOptionLists,
      ),
      integrationGrants: await this.listResolvedGrantsForRole(member.role.id),
    });
    if (!hasBooleanPermission(resolved, "workspace.roles")) {
      throw new ForbiddenException(
        "Missing permission: workspace.roles (roles management)",
      );
    }
  }

  private normalizeGrantInputs(
    grants: ReplaceWorkspaceRoleIntegrationGrantsRequestDto["grants"],
  ): NormalizedGrantInput[] {
    const out: NormalizedGrantInput[] = [];
    const seen = new Set<string>();
    for (const grant of grants) {
      const integrationType = grant.integrationType?.trim().toLowerCase();
      if (
        !integrationType ||
        !(INTEGRATION_TYPES as readonly string[]).includes(integrationType)
      ) {
        throw new BadRequestException(
          `integrationType must be one of: ${INTEGRATION_TYPES.join(", ")}`,
        );
      }
      const integrationId = Number(grant.integrationId);
      if (!Number.isInteger(integrationId) || integrationId <= 0) {
        throw new BadRequestException("integrationId must be a positive integer");
      }
      if (!grant.permissions || typeof grant.permissions !== "object") {
        throw new BadRequestException(
          "each grant must include a permissions object",
        );
      }
      const key = `${integrationType}:${integrationId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const typed = integrationType as WorkspaceRoleIntegrationGrantType;
      out.push({
        integrationType: typed,
        integrationId,
        permissions: normalizeIntegrationGrantPermissions(
          {
            read: grant.permissions.read,
            write: grant.permissions.write,
            assignResponsibility: grant.permissions.assignResponsibility,
            instagramCommentsView: grant.permissions.instagramCommentsView,
            instagramCommentsWrite: grant.permissions.instagramCommentsWrite,
          },
          typed,
        ),
      });
    }
    return out;
  }

  private async assertIntegrationsExistInWorkspace(
    workspaceId: number,
    grants: NormalizedGrantInput[],
  ): Promise<void> {
    const instagramIds = grants
      .filter((g) => g.integrationType === "instagram")
      .map((g) => g.integrationId);
    const telegramIds = grants
      .filter((g) => g.integrationType === "telegram")
      .map((g) => g.integrationId);

    if (instagramIds.length > 0) {
      const rows = await this.instagramRepo.find({
        where: { workspaceId, id: In(instagramIds) },
        select: { id: true },
      });
      if (rows.length !== instagramIds.length) {
        throw new BadRequestException(
          "One or more Instagram integrations do not belong to this workspace",
        );
      }
    }

    if (telegramIds.length > 0) {
      const rows = await this.telegramRepo.find({
        where: { workspaceId, id: In(telegramIds) },
        select: { id: true },
      });
      if (rows.length !== telegramIds.length) {
        throw new BadRequestException(
          "One or more Telegram integrations do not belong to this workspace",
        );
      }
    }
  }

  private toResolvedGrant(
    grant: WorkspaceRoleIntegrationGrant,
  ): ResolvedIntegrationGrant {
    return {
      integrationType: grant.integrationType,
      integrationId: grant.integrationId,
      read: grant.conversationsReadScope,
      write: grant.conversationsWriteScope,
      assignResponsibility: grant.conversationsAssignResponsibility,
      instagramCommentsView: grant.instagramCommentsRead,
      instagramCommentsWrite: grant.instagramCommentsWrite,
    };
  }

  private async enrichGrants(
    workspaceId: number,
    grants: WorkspaceRoleIntegrationGrant[],
  ): Promise<WorkspaceRoleIntegrationGrantItemDto[]> {
    if (grants.length === 0) {
      return [];
    }

    const instagramIds = grants
      .filter((g) => g.integrationType === "instagram")
      .map((g) => g.integrationId);
    const telegramIds = grants
      .filter((g) => g.integrationType === "telegram")
      .map((g) => g.integrationId);

    const instagramById = new Map<number, string>();
    if (instagramIds.length > 0) {
      const rows = await this.instagramRepo.find({
        where: { workspaceId, id: In(instagramIds) },
      });
      for (const row of rows) {
        instagramById.set(
          row.id,
          row.facebookPageName?.trim() || row.name?.trim() || `Instagram #${row.id}`,
        );
      }
    }

    const telegramById = new Map<number, string>();
    if (telegramIds.length > 0) {
      const rows = await this.telegramRepo.find({
        where: { workspaceId, id: In(telegramIds) },
      });
      for (const row of rows) {
        telegramById.set(
          row.id,
          row.name?.trim() ||
            row.telegramUsername?.trim() ||
            `Telegram #${row.id}`,
        );
      }
    }

    return grants.map((grant) => {
      const permissions = normalizeIntegrationGrantPermissions(
        {
          read: grant.conversationsReadScope,
          write: grant.conversationsWriteScope,
          assignResponsibility: grant.conversationsAssignResponsibility,
          instagramCommentsView: grant.instagramCommentsRead,
          instagramCommentsWrite: grant.instagramCommentsWrite,
        },
        grant.integrationType,
      );
      return {
        integrationType: grant.integrationType,
        integrationId: grant.integrationId,
        integrationName:
          grant.integrationType === "instagram"
            ? (instagramById.get(grant.integrationId) ??
              `Instagram #${grant.integrationId}`)
            : (telegramById.get(grant.integrationId) ??
              `Telegram #${grant.integrationId}`),
        permissions: {
          read: permissions.read,
          write: permissions.write,
          assignResponsibility: permissions.assignResponsibility,
          instagramCommentsView: permissions.instagramCommentsView,
          instagramCommentsWrite: permissions.instagramCommentsWrite,
        },
      };
    });
  }
}
