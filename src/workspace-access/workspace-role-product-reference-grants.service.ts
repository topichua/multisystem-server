import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  PRODUCT_REFERENCE_INTEGRATION_TYPES,
  type ProductReferenceIntegrationType,
} from "../integrations/integration-type";
import {
  InstagramIntegration,
  TelegramIntegration,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
  WorkspaceRoleProductReferenceGrant,
} from "../database/entities";
import type {
  ReplaceWorkspaceRoleProductReferenceGrantsRequestDto,
  WorkspaceRoleProductReferenceGrantItemDto,
  WorkspaceRoleProductReferenceGrantsResponseDto,
} from "./dto/http/workspace-role-product-reference-grants.dto";
import { hasBooleanPermission, resolveRolePermissions } from "./permissions/permissions-resolver";
import { normalizePermissionOptionLists } from "./permissions/permission-option-lists.util";
import { normalizePermissionOptions } from "./permissions/permission-options.util";
import type { ResolvedProductReferenceGrant } from "./permissions/resolved-permissions.type";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";

type NormalizedGrantInput = {
  integrationType: ProductReferenceIntegrationType;
  integrationId: number;
  canManage: boolean;
};

@Injectable()
export class WorkspaceRoleProductReferenceGrantsService {
  constructor(
    @InjectRepository(WorkspaceRoleProductReferenceGrant)
    private readonly grantRepo: Repository<WorkspaceRoleProductReferenceGrant>,
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
  ): Promise<WorkspaceRoleProductReferenceGrantsResponseDto> {
    const role = await this.requireRole(roleId);
    await this.assertCanManageRoleGrants(actorUserId, role.workspaceId, appRole);
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
    dto: ReplaceWorkspaceRoleProductReferenceGrantsRequestDto,
    appRole?: string,
  ): Promise<WorkspaceRoleProductReferenceGrantsResponseDto> {
    const role = await this.requireRole(roleId);
    await this.assertCanManageRoleGrants(actorUserId, role.workspaceId, appRole);

    const normalized = this.normalizeGrantInputs(dto.grants ?? []);
    await this.assertIntegrationsExistInWorkspace(role.workspaceId, normalized);

    await this.grantRepo.delete({ roleId: role.id });
    const enabled = normalized.filter((grant) => grant.canManage);
    if (enabled.length > 0) {
      await this.grantRepo.save(
        enabled.map((grant) =>
          this.grantRepo.create({
            workspaceId: role.workspaceId,
            roleId: role.id,
            integrationType: grant.integrationType,
            integrationId: grant.integrationId,
            canManage: true,
            grantedByUserId: actorUserId,
          }),
        ),
      );
    }

    const grants = await this.grantRepo.find({
      where: { roleId: role.id },
      order: { integrationType: "ASC", integrationId: "ASC" },
    });
    return {
      roleId: role.id,
      grants: await this.enrichGrants(role.workspaceId, grants),
    };
  }

  async listResolvedGrantsForWorkspace(
    workspaceId: number,
  ): Promise<ResolvedProductReferenceGrant[]> {
    const channels = await this.listWorkspaceChannels(workspaceId);
    return channels.map((channel) => ({
      integrationType: channel.integrationType,
      integrationId: channel.integrationId,
      canManage: true,
    }));
  }

  async listResolvedGrantsForRole(
    roleId: number,
  ): Promise<ResolvedProductReferenceGrant[]> {
    const rows = await this.grantRepo.find({
      where: { roleId, canManage: true },
      order: { integrationType: "ASC", integrationId: "ASC" },
    });
    return rows.map((row) => ({
      integrationType: row.integrationType,
      integrationId: row.integrationId,
      canManage: true,
    }));
  }

  private async requireRole(roleId: number): Promise<WorkspaceRole> {
    if (!Number.isInteger(roleId) || roleId <= 0) {
      throw new BadRequestException("roleId must be a positive integer");
    }
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException("Workspace role not found");
    }
    return role;
  }

  private async assertCanManageRoleGrants(
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
      productReferenceGrants: await this.listResolvedGrantsForRole(
        member.role.id,
      ),
    });
    if (!hasBooleanPermission(resolved, "workspace.roles")) {
      throw new ForbiddenException("Missing permission: workspace.roles");
    }
  }

  private normalizeGrantInputs(
    grants: ReplaceWorkspaceRoleProductReferenceGrantsRequestDto["grants"],
  ): NormalizedGrantInput[] {
    const out: NormalizedGrantInput[] = [];
    const seen = new Set<string>();
    for (const grant of grants) {
      const integrationType =
        grant.integrationType as ProductReferenceIntegrationType;
      if (
        !PRODUCT_REFERENCE_INTEGRATION_TYPES.includes(integrationType)
      ) {
        throw new BadRequestException(
          `Unsupported integrationType: ${grant.integrationType}. ` +
            "Product reference grants support only instagram and telegram.",
        );
      }
      if (!Number.isInteger(grant.integrationId) || grant.integrationId <= 0) {
        throw new BadRequestException("integrationId must be a positive integer");
      }
      const key = `${integrationType}:${grant.integrationId}`;
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate grant for ${key}`);
      }
      seen.add(key);
      out.push({
        integrationType,
        integrationId: grant.integrationId,
        canManage: grant.canManage === true,
      });
    }
    return out;
  }

  private async assertIntegrationsExistInWorkspace(
    workspaceId: number,
    grants: NormalizedGrantInput[],
  ): Promise<void> {
    const channels = await this.listWorkspaceChannels(workspaceId);
    const allowed = new Set(
      channels.map((channel) => `${channel.integrationType}:${channel.integrationId}`),
    );
    const missing = grants.filter(
      (grant) => !allowed.has(`${grant.integrationType}:${grant.integrationId}`),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown integration(s) for workspace: ${missing
          .map((grant) => `${grant.integrationType}:${grant.integrationId}`)
          .join(", ")}`,
      );
    }
  }

  private async enrichGrants(
    workspaceId: number,
    grants: WorkspaceRoleProductReferenceGrant[],
  ): Promise<WorkspaceRoleProductReferenceGrantItemDto[]> {
    const channels = await this.listWorkspaceChannels(workspaceId);
    const granted = new Map(
      grants.map((grant) => [
        `${grant.integrationType}:${grant.integrationId}`,
        grant.canManage,
      ]),
    );
    return channels.map((channel) => ({
      integrationType: channel.integrationType,
      integrationId: channel.integrationId,
      integrationName: channel.integrationName,
      canManage:
        granted.get(`${channel.integrationType}:${channel.integrationId}`) ===
        true,
    }));
  }

  private async listWorkspaceChannels(workspaceId: number): Promise<
    Array<{
      integrationType: ProductReferenceIntegrationType;
      integrationId: number;
      integrationName: string;
    }>
  > {
    const [instagram, telegram] = await Promise.all([
      this.instagramRepo.find({
        where: { workspaceId },
        order: { id: "ASC" },
      }),
      this.telegramRepo.find({
        where: { workspaceId },
        order: { id: "ASC" },
      }),
    ]);

    return [
      ...instagram.map((row) => ({
        integrationType: "instagram" as const,
        integrationId: row.id,
        integrationName:
          row.facebookPageName?.trim() ||
          row.name?.trim() ||
          `Instagram #${row.id}`,
      })),
      ...telegram.map((row) => ({
        integrationType: "telegram" as const,
        integrationId: row.id,
        integrationName:
          row.name?.trim() ||
          row.telegramUsername?.trim() ||
          `Telegram #${row.id}`,
      })),
    ];
  }
}
