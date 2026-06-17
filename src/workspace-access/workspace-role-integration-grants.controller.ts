import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  ReplaceWorkspaceRoleIntegrationGrantsRequestDto,
  WorkspaceRoleIntegrationGrantsResponseDto,
} from "./dto/http/workspace-role-integration-grants.dto";
import { WorkspaceRoleIntegrationGrantsService } from "./workspace-role-integration-grants.service";

@ApiTags("workspace — roles")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/roles/:roleId/integration-grants")
export class WorkspaceRoleIntegrationGrantsController {
  constructor(private readonly grants: WorkspaceRoleIntegrationGrantsService) {}

  @Get()
  @ApiOperation({
    summary: "List integration grants for a role",
    description:
      "Returns every workspace integration with this role's grant settings. " +
      "Ungranted integrations include read/write defaults only; granted integrations also include boolean permissions. " +
      "Requires workspace owner or `workspace.roles` permission.",
  })
  @ApiParam({ name: "roleId", type: Number })
  @ApiOkResponse({ type: WorkspaceRoleIntegrationGrantsResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Param("roleId") roleIdRaw: string,
  ): Promise<WorkspaceRoleIntegrationGrantsResponseDto> {
    const { userId, appRole } = this.auth(req);
    return this.grants.listForRole(
      userId,
      this.parsePositiveInt(roleIdRaw, "roleId"),
      appRole,
    );
  }

  @Put()
  @ApiOperation({
    summary: "Replace integration grants for a role",
    description:
      "Replaces the full grant list. Omitting a new integration keeps it denied until granted here. " +
      "Requires workspace owner or `workspace.roles` permission.",
  })
  @ApiParam({ name: "roleId", type: Number })
  @ApiBody({ type: ReplaceWorkspaceRoleIntegrationGrantsRequestDto })
  @ApiOkResponse({ type: WorkspaceRoleIntegrationGrantsResponseDto })
  async replace(
    @Req() req: { user?: AuthUser },
    @Param("roleId") roleIdRaw: string,
    @Body() dto: ReplaceWorkspaceRoleIntegrationGrantsRequestDto,
  ): Promise<WorkspaceRoleIntegrationGrantsResponseDto> {
    const { userId, appRole } = this.auth(req);
    return this.grants.replaceForRole(
      userId,
      this.parsePositiveInt(roleIdRaw, "roleId"),
      dto,
      appRole,
    );
  }

  private auth(req: { user?: AuthUser }): {
    userId: number;
    appRole: string | undefined;
  } {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric user id",
      );
    }
    return { userId, appRole: req.user?.role };
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
