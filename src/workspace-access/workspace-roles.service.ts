import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "../database/entities";
import type { CreateWorkspaceRoleRequestDto } from "./dto/http/create-workspace-role-request.dto";
import type { ListWorkspaceRolesQueryDto } from "./dto/http/list-workspace-roles-query.dto";
import type { UpdateWorkspaceRoleRequestDto } from "./dto/http/update-workspace-role-request.dto";
import type { WorkspaceRoleResponseDto } from "./dto/http/workspace-role-response.dto";
import { normalizePermissionOptionLists } from "./permissions/permission-option-lists.util";
import { normalizePermissionOptions } from "./permissions/permission-options.util";
import { resolveRolePermissions } from "./permissions/permissions-resolver";
import {
  validatePermissionKeys,
  validatePermissionOptionLists,
  validatePermissionOptions,
} from "./permissions/permissions.validator";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspaceRoleIntegrationGrantsService } from "./workspace-role-integration-grants.service";

@Injectable()
export class WorkspaceRolesService {
  constructor(
    @InjectRepository(WorkspaceRole)
    private readonly roleRepo: Repository<WorkspaceRole>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly integrationGrants: WorkspaceRoleIntegrationGrantsService,
  ) {}

  async listForOwner(
    ownerId: number,
    appRole?: string,
    query?: ListWorkspaceRolesQueryDto,
  ): Promise<WorkspaceRoleResponseDto[]> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    return this.listForWorkspace(ownerId, workspace.id, appRole, query);
  }

  async createForOwner(
    ownerId: number,
    dto: CreateWorkspaceRoleRequestDto,
    appRole?: string,
  ): Promise<WorkspaceRoleResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    return this.createForWorkspace(ownerId, workspace.id, dto, appRole);
  }

  async updateForOwner(
    ownerId: number,
    roleId: number,
    dto: UpdateWorkspaceRoleRequestDto,
    appRole?: string,
  ): Promise<WorkspaceRoleResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    return this.updateForWorkspace(
      ownerId,
      workspace.id,
      roleId,
      dto,
      appRole,
    );
  }

  async deleteForOwner(
    ownerId: number,
    roleId: number,
    appRole?: string,
  ): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    return this.deleteForWorkspace(ownerId, workspace.id, roleId, appRole);
  }

  async listForWorkspace(
    ownerId: number,
    workspaceId: number,
    appRole?: string,
    query?: ListWorkspaceRolesQueryDto,
  ): Promise<WorkspaceRoleResponseDto[]> {
    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      workspaceId,
      appRole,
    );
    const rows = await this.roleRepo.find({
      where: { workspaceId },
      order: { id: "ASC" },
    });
    const membersCountByRoleId = query?.include_members_count
      ? await this.countActiveMembersByRoleId(workspaceId)
      : undefined;
    return Promise.all(
      rows.map((row) => this.toDto(row, membersCountByRoleId)),
    );
  }

  async createForWorkspace(
    ownerId: number,
    workspaceId: number,
    dto: CreateWorkspaceRoleRequestDto,
    appRole?: string,
  ): Promise<WorkspaceRoleResponseDto> {
    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      workspaceId,
      appRole,
    );
    const slug = dto.slug.trim().toLowerCase();
    const existing = await this.roleRepo.findOne({
      where: { workspaceId, slug },
    });
    if (existing) {
      throw new ConflictException(
        `Role slug "${slug}" already exists in this workspace`,
      );
    }

    const permissions = validatePermissionKeys(dto.permissions);
    const permissionOptions = validatePermissionOptions(dto.permissionOptions);
    const permissionOptionLists = validatePermissionOptionLists(
      permissionOptions,
      undefined,
    );
    const row = this.roleRepo.create({
      workspaceId,
      slug,
      name: dto.name.trim(),
      description: dto.description?.trim() ? dto.description.trim() : null,
      color: dto.color?.trim() ? dto.color.trim() : null,
      permissions,
      permissionOptions,
      permissionOptionLists,
    });
    const saved = await this.roleRepo.save(row);
    return this.toDto(saved);
  }

  async updateForWorkspace(
    ownerId: number,
    workspaceId: number,
    roleId: number,
    dto: UpdateWorkspaceRoleRequestDto,
    appRole?: string,
  ): Promise<WorkspaceRoleResponseDto> {
    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      workspaceId,
      appRole,
    );
    const row = await this.requireRoleInWorkspace(workspaceId, roleId);
    if (dto.name != null) {
      row.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      row.description =
        dto.description === null || dto.description.trim() === ""
          ? null
          : dto.description.trim();
    }
    if (dto.color !== undefined) {
      row.color =
        dto.color === null || dto.color.trim() === "" ? null : dto.color.trim();
    }
    if (dto.permissions != null) {
      row.permissions = validatePermissionKeys(dto.permissions);
    }
    if (dto.permissionOptions != null) {
      row.permissionOptions = validatePermissionOptions(dto.permissionOptions);
    }
    if (dto.permissionOptionLists != null || dto.permissionOptions != null) {
      row.permissionOptionLists = validatePermissionOptionLists(
        row.permissionOptions,
        dto.permissionOptionLists ?? row.permissionOptionLists,
      );
    }
    const saved = await this.roleRepo.save(row);
    return this.toDto(saved);
  }

  async deleteForWorkspace(
    ownerId: number,
    workspaceId: number,
    roleId: number,
    appRole?: string,
  ): Promise<void> {
    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      workspaceId,
      appRole,
    );
    await this.requireRoleInWorkspace(workspaceId, roleId);
    try {
      await this.roleRepo.delete({ id: roleId, workspaceId });
    } catch {
      throw new BadRequestException(
        "Cannot delete role while members or invitations reference it",
      );
    }
  }

  async requireRoleInWorkspace(
    workspaceId: number,
    roleId: number,
  ): Promise<WorkspaceRole> {
    const row = await this.roleRepo.findOne({
      where: { id: roleId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Workspace role not found");
    }
    return row;
  }

  private async countActiveMembersByRoleId(
    workspaceId: number,
  ): Promise<Map<number, number>> {
    const rows = await this.memberRepo
      .createQueryBuilder("member")
      .select("member.roleId", "roleId")
      .addSelect("COUNT(*)", "count")
      .where("member.workspaceId = :workspaceId", { workspaceId })
      .andWhere("member.status = :status", {
        status: WorkspaceMemberStatus.ACTIVE,
      })
      .groupBy("member.roleId")
      .getRawMany<{ roleId: string | number; count: string }>();

    const counts = new Map<number, number>();
    for (const row of rows) {
      counts.set(Number(row.roleId), Number(row.count));
    }
    return counts;
  }

  private async toDto(
    row: WorkspaceRole,
    membersCountByRoleId?: Map<number, number>,
  ): Promise<WorkspaceRoleResponseDto> {
    const permissionOptions = normalizePermissionOptions(row.permissionOptions);
    const permissionOptionLists = normalizePermissionOptionLists(
      permissionOptions,
      row.permissionOptionLists,
    );
    const integrationGrants =
      await this.integrationGrants.resolveIntegrationGrantsForRole(
        row.workspaceId,
        row.id,
        row.permissions,
      );
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      color: row.color,
      permissions: row.permissions ?? [],
      permissionOptions,
      permissionOptionLists,
      resolved: resolveRolePermissions({
        permissions: row.permissions,
        permissionOptions,
        permissionOptionLists,
        integrationGrants,
      }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(membersCountByRoleId != null
        ? { membersCount: membersCountByRoleId.get(row.id) ?? 0 }
        : {}),
    };
  }
}
