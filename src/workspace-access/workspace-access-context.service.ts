import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ROLE_SUPER_ADMIN } from "../auth/constants";
import { Company, Workspace } from "../database/entities";

@Injectable()
export class WorkspaceAccessContextService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  /**
   * Current user's workspace from their latest instagram_integration row
   * (same resolution as GET /workspace/settings).
   */
  async requireWorkspaceForOwner(
    ownerId: number,
    appRole?: string,
  ): Promise<Workspace> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!company) {
      throw new NotFoundException(
        "Integration not found for current user; create a workspace first",
      );
    }
    return this.requireWorkspaceOwner(ownerId, company.workspaceId, appRole);
  }

  /** Workspace owner or platform super_admin. */
  async requireWorkspaceOwner(
    ownerId: number,
    workspaceId: number,
    appRole?: string,
  ): Promise<Workspace> {
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
