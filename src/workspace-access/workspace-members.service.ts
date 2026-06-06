import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  User,
  UserStatus, 
  WorkspaceInvitation,
  WorkspaceInvitationStatus,
  WorkspaceMember,
  WorkspaceMemberStatus,
} from "../database/entities";
import { InvitationTokenService } from "../users/crypto/invitation-token.service";
import { PasswordService } from "../users/crypto/password.service";
import type { InviteWorkspaceMemberRequestDto } from "./dto/http/invite-workspace-member-request.dto";
import type {
  InviteWorkspaceMemberResponseDto,
  WorkspaceMemberResponseDto,
} from "./dto/http/workspace-member-response.dto";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspaceRolesService } from "./workspace-roles.service";
import { sample } from "rxjs";

const DEFAULT_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const TEST_SKIP_PASSWORD = "password";

@Injectable()
export class WorkspaceMembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepo: Repository<WorkspaceInvitation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly rolesService: WorkspaceRolesService,
    private readonly passwordService: PasswordService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly config: ConfigService,
  ) {}

  async listForWorkspace(
    ownerId: number,
    appRole?: string,
  ): Promise<WorkspaceMemberResponseDto[]> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const rows = await this.memberRepo.find({
      where: { workspaceId: workspace.id, status: WorkspaceMemberStatus.ACTIVE },
      relations: ["user", "role"],
      order: { id: "ASC" },
    });
    return rows.map((r) => this.toDto(r));
  }

  async inviteForWorkspace(
    ownerId: number,
    dto: InviteWorkspaceMemberRequestDto,
    appRole?: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;
    const role = await this.rolesService.requireRoleInWorkspace(
      workspaceId,
      dto.role_id,
    );
    const email = dto.email.trim().toLowerCase();

    if (dto.skipConfirmation) {
      if (this.config.get<string>("NODE_ENV") === "production") {
        throw new BadRequestException(
          "skipConfirmation is not allowed in production",
        );
      }
      const user = await this.findOrCreateTestUser(dto, email);
      const member = await this.addMember({
        workspaceId,
        userId: user.id,
        roleId: role.id,
        invitedByUserId: ownerId,
      });
      return { kind: "member", member: this.toDto(member) };
    }

    const pendingInvite = await this.invitationRepo.findOne({
      where: {
        workspaceId,
        email,
        status: WorkspaceInvitationStatus.PENDING,
      },
    });
    if (pendingInvite) {
      throw new ConflictException(
        "A pending invitation already exists for this email",
      );
    }

    const rawToken = this.invitationTokenService.generateRawToken();
    const invitation = this.invitationRepo.create({
      workspaceId,
      email,
      roleId: role.id,
      invitedByUserId: ownerId,
      status: WorkspaceInvitationStatus.PENDING,
      tokenHash: this.invitationTokenService.hash(rawToken),
      expiresAt: new Date(Date.now() + DEFAULT_INVITE_TTL_MS),
    });
    const saved = await this.invitationRepo.save(invitation);

    return {
      kind: "invitation",
      invitationId: saved.id,
      invitationToken: rawToken,
    };
  }

  private async findOrCreateTestUser(
    dto: InviteWorkspaceMemberRequestDto,
    email: string,
  ): Promise<User> {
    let user = await this.userRepo.findOne({ where: { email } });
    if (user) {
      if (user.status === UserStatus.Disabled) {
        throw new BadRequestException("User account is disabled");
      }
      return user;
    }

    const firstName = dto.first_name?.trim() || email.split("@")[0] || "User";
    user = this.userRepo.create({
      email,
      firstName,
      lastName: dto.last_name?.trim() || null,
      status: UserStatus.Active,
      passwordHash: await this.passwordService.hash(TEST_SKIP_PASSWORD),
      invitedByUserId: null,
      invitedAt: null,
      metadata: {},
    });
    return this.userRepo.save(user);
  }

  private async addMember(params: {
    workspaceId: number;
    userId: number;
    roleId: number;
    invitedByUserId: number;
  }): Promise<WorkspaceMember> {
    const existing = await this.memberRepo.findOne({
      where: {
        workspaceId: params.workspaceId,
        userId: params.userId,
      },
      relations: ["user", "role"],
    });
    if (existing?.status === WorkspaceMemberStatus.ACTIVE) {
      throw new ConflictException("User is already a member of this workspace");
    }
    if (existing) {
      existing.roleId = params.roleId;
      existing.status = WorkspaceMemberStatus.ACTIVE;
      existing.invitedByUserId = params.invitedByUserId;
      existing.joinedAt = new Date();
      return this.memberRepo.save(existing);
    }

    const row = this.memberRepo.create({
      workspaceId: params.workspaceId,
      userId: params.userId,
      roleId: params.roleId,
      status: WorkspaceMemberStatus.ACTIVE,
      invitedByUserId: params.invitedByUserId,
      joinedAt: new Date(),
    });
    const saved = await this.memberRepo.save(row);
    return this.memberRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ["user", "role"],
    });
  }

  private toDto(row: WorkspaceMember): WorkspaceMemberResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      roleId: row.roleId,
      roleSlug: row.role?.slug ?? "",
      roleName: row.role?.name ?? "",
      status: row.status,
      joinedAt: row.joinedAt.toISOString(),
      user: {
        id: row.user.id,
        email: row.user.email,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      },
    };
  }
}
