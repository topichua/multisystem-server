import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  User,
  UserStatus, 
  Workspace,
  WorkspaceInvitation,
  WorkspaceInvitationStatus,
  WorkspaceMember,
  WorkspaceMemberStatus,
} from "../database/entities";
import { AuthService } from "../auth/auth.service";
import { SendgridService } from "../sendgrid/sendgrid.service";
import { InvitationTokenService } from "../users/crypto/invitation-token.service";
import { PasswordService } from "../users/crypto/password.service";
import type { InviteWorkspaceMemberRequestDto } from "./dto/http/invite-workspace-member-request.dto";
import type { ListWorkspaceMembersQueryDto } from "./dto/http/list-workspace-members-query.dto";
import type { UpdateWorkspaceMemberRequestDto } from "./dto/http/update-workspace-member-request.dto";
import type {
  CompleteWorkspaceMemberRegistrationRequestDto,
  CompleteWorkspaceMemberRegistrationResponseDto,
  WorkspaceMemberRegistrationFormResponseDto,
} from "./dto/http/workspace-member-registration.dto";
import type {
  InviteWorkspaceMemberResponseDto,
  WorkspaceMemberResponseDto,
} from "./dto/http/workspace-member-response.dto";
import {
  assignWorkspaceMemberColor,
  resolveWorkspaceMemberColor,
} from "./workspace-member-color.util";
import { WorkspaceAccessContextService } from "./workspace-access-context.service";
import { WorkspaceRolesService } from "./workspace-roles.service";

const DEFAULT_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const TEST_SKIP_PASSWORD = "password";

@Injectable()
export class WorkspaceMembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepo: Repository<WorkspaceInvitation>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly rolesService: WorkspaceRolesService,
    private readonly passwordService: PasswordService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly sendgrid: SendgridService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async listForWorkspace(
    ownerId: number,
    appRole?: string,
    query?: ListWorkspaceMembersQueryDto,
  ): Promise<WorkspaceMemberResponseDto[]> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    const workspaceId = workspace.id;
    const assignableFilter = query?.can_be_assigned_to_chat;

    const ownerUser = await this.userRepo.findOne({
      where: { id: workspace.ownerId },
    });
    if (!ownerUser) {
      throw new BadRequestException("Workspace owner not found");
    }

    const rows = await this.memberRepo.find({
      where: {
        workspaceId,
        status:
          assignableFilter === undefined
            ? In([
                WorkspaceMemberStatus.ACTIVE,
                WorkspaceMemberStatus.INACTIVE,
                WorkspaceMemberStatus.DEACTIVATED,
              ])
            : WorkspaceMemberStatus.ACTIVE,
        ...(assignableFilter === undefined
          ? {}
          : { canBeAssignedToChat: assignableFilter }),
      },
      relations: ["user", "role"],
      order: { id: "ASC" },
    });

    const memberDtos = rows.map((r) => this.toDto(r));
    const ownerDto = this.ownerToDto(workspace, ownerUser, workspaceId);

    if (assignableFilter === false) {
      return memberDtos;
    }
    return [ownerDto, ...memberDtos];
  }

  async updateMemberForWorkspace(
    actorUserId: number,
    memberId: number,
    dto: UpdateWorkspaceMemberRequestDto,
    appRole?: string,
  ): Promise<WorkspaceMemberResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      actorUserId,
      appRole,
    );
    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw new BadRequestException("memberId must be a positive integer");
    }

    const row = await this.memberRepo.findOne({
      where: {
        id: memberId,
        workspaceId: workspace.id,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: ["user", "role"],
    });
    if (!row) {
      throw new NotFoundException("Workspace member not found");
    }

    const role = await this.rolesService.requireRoleInWorkspace(
      workspace.id,
      dto.role_id,
    );

    await this.memberRepo.update(
      { id: row.id, workspaceId: workspace.id },
      {
        roleId: role.id,
        canBeAssignedToChat: dto.can_be_assigned_to_chat,
      },
    );

    const saved = await this.memberRepo.findOneOrFail({
      where: { id: row.id },
      relations: ["user", "role"],
    });
    return this.toDto(saved);
  }

  async resendInvitationForWorkspace(
    ownerId: number,
    memberId: number,
    appRole?: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    const member = await this.requireInactiveMember(
      workspace.id,
      memberId,
      ["user", "role"],
    );
    const user = member.user;
    if (user.status === UserStatus.Disabled) {
      throw new BadRequestException("User account is disabled");
    }

    const rawToken = await this.refreshInvitationAndSend(
      ownerId,
      workspace.id,
      user,
    );

    const response: InviteWorkspaceMemberResponseDto = {
      kind: "invitation",
      invitationId: member.id,
    };
    if (this.config.get<string>("NODE_ENV") !== "production") {
      response.invitationToken = rawToken;
    }
    return response;
  }

  async removeInviteForWorkspace(
    ownerId: number,
    memberId: number,
    appRole?: string,
  ): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    const member = await this.requireInactiveMember(workspace.id, memberId, [
      "user",
    ]);
    const user = member.user;

    await this.revokePendingWorkspaceInvitations(workspace.id, user.email);
    await this.memberRepo.delete({ id: member.id, workspaceId: workspace.id });

    const otherPending = await this.memberRepo.count({
      where: { userId: user.id, status: WorkspaceMemberStatus.INACTIVE },
    });
    if (otherPending === 0) {
      await this.userRepo.update(user.id, {
        invitationTokenHash: null,
        invitationExpiresAt: null,
      });
    }
  }

  async deactivateMemberForWorkspace(
    ownerId: number,
    memberId: number,
    appRole?: string,
  ): Promise<WorkspaceMemberResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    if (memberId <= 0) {
      throw new BadRequestException("memberId must be a positive integer");
    }

    const row = await this.memberRepo.findOne({
      where: {
        id: memberId,
        workspaceId: workspace.id,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: ["user", "role"],
    });
    if (!row) {
      throw new NotFoundException("Active workspace member not found");
    }
    if (row.userId === workspace.ownerId) {
      throw new BadRequestException("Workspace owner cannot be deactivated");
    }

    await this.memberRepo.update(
      { id: row.id, workspaceId: workspace.id },
      {
        status: WorkspaceMemberStatus.DEACTIVATED,
        canBeAssignedToChat: false,
      },
    );

    const saved = await this.memberRepo.findOneOrFail({
      where: { id: row.id },
      relations: ["user", "role"],
    });
    return this.toDto(saved);
  }

  async inviteForWorkspace(
    ownerId: number,
    dto: InviteWorkspaceMemberRequestDto,
    appRole?: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
    );
    const workspaceId = workspace.id;
    const role = await this.rolesService.requireRoleInWorkspace(
      workspaceId,
      dto.role_id,
    );
    const email = dto.email.trim().toLowerCase();
    const displayName =
      dto.first_name?.trim() || email.split("@")[0] || "User";

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

    let user = await this.userRepo.findOne({ where: { email } });
    if (user) {
      const activeMember = await this.memberRepo.findOne({
        where: {
          workspaceId,
          userId: user.id,
          status: WorkspaceMemberStatus.ACTIVE,
        },
      });
      if (activeMember) {
        throw new ConflictException("User is already a member of this workspace");
      }
      if (user.status === UserStatus.Disabled) {
        throw new BadRequestException("User account is disabled");
      }
    }

    if (!user) {
      user = this.userRepo.create({
        email,
        firstName: displayName,
        lastName: dto.last_name?.trim() || null,
        status: UserStatus.Invited,
        invitedByUserId: ownerId,
        invitedAt: new Date(),
        metadata: {},
      });
      user = await this.userRepo.save(user);
    } else {
      if (dto.first_name?.trim()) {
        user.firstName = dto.first_name.trim();
      }
      if (dto.last_name !== undefined) {
        user.lastName = dto.last_name?.trim() || null;
      }
      if (user.status === UserStatus.Invited) {
        user.invitedByUserId = ownerId;
        user.invitedAt = new Date();
      }
      user = await this.userRepo.save(user);
    }

    let member = await this.memberRepo.findOne({
      where: { workspaceId, userId: user.id },
      relations: ["user", "role"],
    });
    const color = assignWorkspaceMemberColor(
      user.id,
      workspaceId,
      user.avatarSrc,
    );
    if (member) {
      await this.memberRepo.update(
        { id: member.id },
        {
          roleId: role.id,
          status: WorkspaceMemberStatus.INACTIVE,
          invitedByUserId: ownerId,
          color,
        },
      );
      member = await this.memberRepo.findOneOrFail({
        where: { id: member.id },
        relations: ["user", "role"],
      });
    } else {
      member = await this.memberRepo.save(
        this.memberRepo.create({
          workspaceId,
          userId: user.id,
          roleId: role.id,
          status: WorkspaceMemberStatus.INACTIVE,
          invitedByUserId: ownerId,
          joinedAt: new Date(),
          canBeAssignedToChat: true,
          color,
        }),
      );
    }

    const rawToken = await this.refreshInvitationAndSend(
      ownerId,
      workspaceId,
      user,
    );

    const savedMember = await this.memberRepo.findOneOrFail({
      where: { id: member.id },
      relations: ["user", "role"],
    });

    const response: InviteWorkspaceMemberResponseDto = {
      kind: "invitation",
      invitationId: savedMember.id,
    };
    if (this.config.get<string>("NODE_ENV") !== "production") {
      response.invitationToken = rawToken;
    }
    return response;
  }

  async getRegistrationForm(
    rawHash: string,
  ): Promise<WorkspaceMemberRegistrationFormResponseDto> {
    const { user, member, workspace, role } =
      await this.requirePendingRegistration(rawHash);

    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      workspaceName: workspace.name,
      roleName: role.name,
      requiresPassword: !user.passwordHash,
    };
  }

  async completeRegistration(
    rawHash: string,
    dto: CompleteWorkspaceMemberRegistrationRequestDto,
  ): Promise<CompleteWorkspaceMemberRegistrationResponseDto> {
    const { user, member } = await this.requirePendingRegistration(rawHash);

    if (!user.passwordHash) {
      const password = dto.password?.trim();
      if (!password) {
        throw new BadRequestException("password is required");
      }
      user.passwordHash = await this.passwordService.hash(password);
    }

    if (dto.first_name?.trim()) {
      user.firstName = dto.first_name.trim();
    }
    if (dto.last_name !== undefined) {
      user.lastName = dto.last_name?.trim() || null;
    }

    user.status = UserStatus.Active;
    user.invitationAcceptedAt = new Date();
    user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
    user.invitationTokenHash = null;
    user.invitationExpiresAt = null;
    await this.userRepo.save(user);

    member.status = WorkspaceMemberStatus.ACTIVE;
    member.joinedAt = new Date();
    const savedMember = await this.memberRepo.save(member);
    const hydratedMember = await this.memberRepo.findOneOrFail({
      where: { id: savedMember.id },
      relations: ["user", "role"],
    });

    const { access_token } = this.authService.issueAccessTokenForUser(user);
    return {
      registered: true,
      access_token,
      member: this.toDto(hydratedMember),
    };
  }

  private async requirePendingRegistration(rawHash: string): Promise<{
    user: User;
    member: WorkspaceMember;
    workspace: Workspace;
    role: NonNullable<WorkspaceMember["role"]>;
  }> {
    const tokenHash = this.invitationTokenService.hash(rawHash);
    const user = await this.userRepo.findOne({
      where: { invitationTokenHash: tokenHash },
    });
    if (!user) {
      throw new NotFoundException("Invalid or expired invitation");
    }
    if (
      user.invitationExpiresAt &&
      user.invitationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("Invitation has expired");
    }

    const member = await this.memberRepo.findOne({
      where: {
        userId: user.id,
        status: WorkspaceMemberStatus.INACTIVE,
      },
      relations: ["role"],
      order: { id: "DESC" },
    });
    if (!member?.role) {
      throw new NotFoundException("Invalid or expired invitation");
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { id: member.workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    if (user.status === UserStatus.Disabled) {
      throw new BadRequestException("User account is disabled");
    }
    if (
      user.status === UserStatus.Active &&
      member.status !== WorkspaceMemberStatus.INACTIVE
    ) {
      throw new BadRequestException("Invitation is no longer valid");
    }

    return { user, member, workspace, role: member.role };
  }

  private buildInvitationLink(rawToken: string): string {
    const base = this.config.get<string>("APP_URL")?.trim().replace(/\/$/, "");
    if (!base) {
      throw new InternalServerErrorException("APP_URL is not configured");
    }
    return `${base}/invitation/${rawToken}`;
  }

  private async requireInactiveMember(
    workspaceId: number,
    memberId: number,
    relations: Array<"user" | "role"> = ["user"],
  ): Promise<WorkspaceMember> {
    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw new BadRequestException("memberId must be a positive integer");
    }

    const member = await this.memberRepo.findOne({
      where: {
        id: memberId,
        workspaceId,
        status: WorkspaceMemberStatus.INACTIVE,
      },
      relations,
    });
    if (!member) {
      throw new NotFoundException("Pending workspace invitation not found");
    }
    return member;
  }

  private async revokePendingWorkspaceInvitations(
    workspaceId: number,
    email: string,
  ): Promise<void> {
    await this.invitationRepo.update(
      {
        workspaceId,
        email,
        status: WorkspaceInvitationStatus.PENDING,
      },
      { status: WorkspaceInvitationStatus.REVOKED },
    );
  }

  private async refreshInvitationAndSend(
    ownerId: number,
    workspaceId: number,
    user: User,
  ): Promise<string> {
    const rawToken = this.invitationTokenService.generateRawToken();
    const invitationExpiresAt = new Date(Date.now() + DEFAULT_INVITE_TTL_MS);

    await this.userRepo.update(user.id, {
      invitationTokenHash: this.invitationTokenService.hash(rawToken),
      invitationExpiresAt,
      invitedByUserId: ownerId,
      invitedAt: new Date(),
    });

    await this.revokePendingWorkspaceInvitations(workspaceId, user.email);

    const invitationLink = this.buildInvitationLink(rawToken);
    await this.sendgrid.sendWorkspaceInvitationEmail(
      user.email,
      user.firstName,
      invitationLink,
    );

    return rawToken;
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
    const user =
      existing?.user ??
      (await this.userRepo.findOneOrFail({ where: { id: params.userId } }));
    const color = assignWorkspaceMemberColor(
      user.id,
      params.workspaceId,
      user.avatarSrc,
    );

    if (existing) {
      await this.memberRepo.update(
        { id: existing.id },
        {
          roleId: params.roleId,
          status: WorkspaceMemberStatus.ACTIVE,
          invitedByUserId: params.invitedByUserId,
          joinedAt: new Date(),
          color,
        },
      );
      return this.memberRepo.findOneOrFail({
        where: { id: existing.id },
        relations: ["user", "role"],
      });
    }

    const row = this.memberRepo.create({
      workspaceId: params.workspaceId,
      userId: params.userId,
      roleId: params.roleId,
      status: WorkspaceMemberStatus.ACTIVE,
      invitedByUserId: params.invitedByUserId,
      joinedAt: new Date(),
      canBeAssignedToChat: true,
      color,
    });
    const saved = await this.memberRepo.save(row);
    return this.memberRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ["user", "role"],
    });
  }

  private toDto(row: WorkspaceMember): WorkspaceMemberResponseDto {
    const color = resolveWorkspaceMemberColor(
      row.userId,
      row.workspaceId,
      row.user.avatarSrc,
      row.color,
    );
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      roleId: row.roleId,
      roleSlug: row.role?.slug ?? "",
      roleName: row.role?.name ?? "",
      status: row.status,
      joinedAt: row.joinedAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      can_be_assigned_to_chat: row.canBeAssignedToChat,
      ...(color ? { color } : {}),
      user: this.userToDto(row.user),
    };
  }

  private userToDto(user: User): WorkspaceMemberResponseDto["user"] {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar_src: user.avatarSrc,
    };
  }

  private ownerToDto(
    workspace: { createdAt?: Date },
    ownerUser: User,
    workspaceId: number,
  ): WorkspaceMemberResponseDto {
    const color = resolveWorkspaceMemberColor(
      ownerUser.id,
      workspaceId,
      ownerUser.avatarSrc,
      null,
    );
    return {
      id: 0,
      workspaceId,
      userId: ownerUser.id,
      roleId: 0,
      roleSlug: "owner",
      roleName: "Owner",
      status: WorkspaceMemberStatus.ACTIVE,
      joinedAt: workspace.createdAt?.toISOString() ?? new Date().toISOString(),
      updated_at: workspace.createdAt?.toISOString() ?? new Date().toISOString(),
      can_be_assigned_to_chat: true,
      ...(color ? { color } : {}),
      user: this.userToDto(ownerUser),
    };
  }
}
