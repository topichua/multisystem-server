import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ROLE_SUPER_ADMIN } from "../auth/constants";
import { InstagramIntegration, Workspace, WorkspaceMember, WorkspaceMemberStatus } from "../database/entities";

@Injectable()
export class WorkspaceAccessContextService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
  ) {}

  /**
   * Primary workspace for the user as owner or active member, optionally by explicit id.
   */
  async requireWorkspaceForOwner(
    ownerId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<Workspace> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }

    if (workspaceIdParam != null) {
      return this.requireWorkspaceOwner(ownerId, workspaceIdParam, appRole);
    }

    // Check if user is owner of a workspace
    let workspace = await this.workspaceRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (workspace) {
      return workspace;
    }

    // Check if user is an active member of a workspace
    const member = await this.memberRepo.findOne({
      where: { userId: ownerId, status: WorkspaceMemberStatus.ACTIVE },
      relations: ["workspace"],
      order: { id: "DESC" },
    });
    if (member?.workspace) {
      return member.workspace;
    }

    throw new NotFoundException(
      "Workspace not found for current user; create a workspace or be invited as a member",
    );
  }

  async resolveWorkspaceIdForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<number> {
    const workspace = await this.requireWorkspaceForOwner(
      ownerId,
      undefined,
      workspaceIdParam,
    );
    return workspace.id;
  }

  /** Instagram integration for workspace (accessible to owner or members). */
  async requireInstagramIntegrationForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<InstagramIntegration> {
    const workspace = await this.requireWorkspaceForOwner(
      ownerId,
      undefined,
      workspaceIdParam,
    );
    const row = await this.instagramIntegrationRepo.findOne({
      where: { workspaceId: workspace.id },
      order: { id: "DESC" },
    });
    if (!row) {
      throw new NotFoundException(
        "Instagram integration not found; connect Instagram via POST /integrations",
      );
    }
    if (!row.accessToken?.trim()) {
      throw new NotFoundException(
        "Instagram is not connected; connect via POST /integrations",
      );
    }
    return row;
  }

  async findInstagramIntegrationForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<InstagramIntegration | null> {
    const workspace = await this.requireWorkspaceForOwner(
      ownerId,
      undefined,
      workspaceIdParam,
    );
    return this.instagramIntegrationRepo.findOne({
      where: { workspaceId: workspace.id },
      order: { id: "DESC" },
    });
  }

  /** Workspace member or owner or platform super_admin. */
  async requireWorkspaceOwner(
    ownerId: number,
    workspaceId: number,
    appRole?: string,
  ): Promise<Workspace> {
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }
    if (appRole === ROLE_SUPER_ADMIN) {
      return workspace;
    }
    // Check if user is workspace owner
    if (workspace.ownerId === ownerId) {
      return workspace;
    }
    // Check if user is an active member
    const member = await this.memberRepo.findOne({
      where: {
        workspaceId,
        userId: ownerId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ForbiddenException(
        "Only workspace owners and members can perform this action",
      );
    }
    return workspace;
  }
}
