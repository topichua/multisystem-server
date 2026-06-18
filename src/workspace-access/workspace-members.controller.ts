import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { InviteWorkspaceMemberRequestDto } from "./dto/http/invite-workspace-member-request.dto";
import { ListWorkspaceMembersQueryDto } from "./dto/http/list-workspace-members-query.dto";
import { UpdateWorkspaceMemberRequestDto } from "./dto/http/update-workspace-member-request.dto";
import {
  InviteWorkspaceMemberResponseDto,
  WorkspaceMemberResponseDto,
  WorkspaceMembersListResponseDto,
} from "./dto/http/workspace-member-response.dto";
import { WorkspaceMembersService } from "./workspace-members.service";

@ApiTags("workspace — members")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspaces/members")
export class WorkspaceMembersController {
  constructor(private readonly members: WorkspaceMembersService) {}

  @Get()
  @ApiOperation({
    summary: "List workspace members",
    description:
      "Returns active and inactive (pending invitation) members. " +
      "Optional filter: `can_be_assigned_to_chat=true` returns assignable active members only (includes owner).",
  })
  @ApiOkResponse({ type: WorkspaceMembersListResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Query() query: ListWorkspaceMembersQueryDto,
  ): Promise<WorkspaceMembersListResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    const items = await this.members.listForWorkspace(ownerId, appRole, query);
    return { items };
  }

  @Put(":memberId")
  @ApiOperation({ summary: "Update workspace member role and assignment settings" })
  @ApiParam({ name: "memberId", type: Number })
  @ApiBody({ type: UpdateWorkspaceMemberRequestDto })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("memberId") memberIdRaw: string,
    @Body() dto: UpdateWorkspaceMemberRequestDto,
  ): Promise<WorkspaceMemberResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    return this.members.updateMemberForWorkspace(
      ownerId,
      this.parsePositiveInt(memberIdRaw, "memberId"),
      dto,
      appRole,
    );
  }

  @Post(":memberId/resend")
  @ApiOperation({
    summary: "Resend workspace member invitation",
    description:
      "Generates a new invitation token and sends the invitation email. " +
      "Only for members with inactive (pending invitation) status.",
  })
  @ApiParam({ name: "memberId", type: Number })
  @ApiCreatedResponse({ type: InviteWorkspaceMemberResponseDto })
  async resendInvitation(
    @Req() req: { user?: AuthUser },
    @Param("memberId") memberIdRaw: string,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    return this.members.resendInvitationForWorkspace(
      ownerId,
      this.parsePositiveInt(memberIdRaw, "memberId"),
      appRole,
    );
  }

  @Delete(":memberId/remove-invite")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove pending workspace invitation",
    description:
      "Deletes the inactive workspace member row and revokes the invitation. " +
      "Only works when member status is inactive.",
  })
  @ApiParam({ name: "memberId", type: Number })
  @ApiNoContentResponse()
  async removeInvite(
    @Req() req: { user?: AuthUser },
    @Param("memberId") memberIdRaw: string,
  ): Promise<void> {
    const { ownerId, appRole } = this.auth(req);
    await this.members.removeInviteForWorkspace(
      ownerId,
      this.parsePositiveInt(memberIdRaw, "memberId"),
      appRole,
    );
  }

  @Delete(":memberId/deactivate")
  @ApiOperation({
    summary: "Deactivate workspace member",
    description: "Sets member status to deactivated. Only active members can be deactivated.",
  })
  @ApiParam({ name: "memberId", type: Number })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  async deactivate(
    @Req() req: { user?: AuthUser },
    @Param("memberId") memberIdRaw: string,
  ): Promise<WorkspaceMemberResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    return this.members.deactivateMemberForWorkspace(
      ownerId,
      this.parsePositiveInt(memberIdRaw, "memberId"),
      appRole,
    );
  }

  @Post("invite")
  @ApiOperation({
    summary: "Invite a member by email (workspace owner assigns role)",
    description:
      "Creates an invited user and inactive workspace member, sends a SendGrid invitation email, " +
      "and returns invitationId (workspace member id). " +
      "skipConfirmation (non-production): creates user with password \"password\" and adds member immediately.",
  })
  @ApiBody({ type: InviteWorkspaceMemberRequestDto })
  @ApiCreatedResponse({ type: InviteWorkspaceMemberResponseDto })
  async invite(
    @Req() req: { user?: AuthUser },
    @Body() dto: InviteWorkspaceMemberRequestDto,
  ): Promise<InviteWorkspaceMemberResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    return this.members.inviteForWorkspace(ownerId, dto, appRole);
  }

  private auth(req: { user?: AuthUser }): {
    ownerId: number;
    appRole: string | undefined;
  } {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return { ownerId, appRole: req.user?.role };
  }

  private parsePositiveInt(raw: string, label: string): number {
    const trimmed = raw?.trim() ?? "";
    if (!/^\d+$/.test(trimmed)) {
      throw new BadRequestException(`${label} must be a positive integer`);
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException(`${label} must be a positive integer`);
    }
    return n;
  }
}
