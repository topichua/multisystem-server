import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ROLE_SUPER_ADMIN } from "../auth/constants";
import { InstagramIntegration, Workspace } from "../database/entities";

@Injectable()
export class WorkspaceAccessContextService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
  ) {}

  /**
   * Primary workspace for the owner (`workspace.owner_id`), optionally by explicit id.
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

    const workspace = await this.workspaceRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!workspace) {
      throw new NotFoundException(
        "Workspace not found for current user; create a workspace first",
      );
    }
    return workspace;
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

  /** Instagram row when Meta tokens / page id are required (conversations, OAuth, etc.). */
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
      where: { ownerId, workspaceId: workspace.id },
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
      where: { ownerId, workspaceId: workspace.id },
      order: { id: "DESC" },
    });
  }

  /** Workspace owner or platform super_admin. */
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
    if (workspace.ownerId !== ownerId) {
      throw new ForbiddenException(
        "Only the workspace owner can perform this action",
      );
    }
    return workspace;
  }
}
