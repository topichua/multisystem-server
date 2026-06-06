import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { InviteWorkspaceMemberRequestDto } from "./dto/http/invite-workspace-member-request.dto";
import {
  InviteWorkspaceMemberResponseDto,
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
  @ApiOperation({ summary: "List active workspace members (workspace owner)" })
  @ApiOkResponse({ type: WorkspaceMembersListResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
  ): Promise<WorkspaceMembersListResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    const items = await this.members.listForWorkspace(ownerId, appRole);
    return { items };
  }

  @Post("invite")
  @ApiOperation({
    summary: "Invite a member by email (workspace owner assigns role)",
    description:
      "Normal flow creates a pending workspace_invitations row. " +
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

}
