import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateWorkspaceRoleRequestDto } from "./dto/http/create-workspace-role-request.dto";
import { UpdateWorkspaceRoleRequestDto } from "./dto/http/update-workspace-role-request.dto";
import {
  WorkspaceRoleResponseDto,
  WorkspaceRolesListResponseDto,
} from "./dto/http/workspace-role-response.dto";
import { WorkspaceRolesService } from "./workspace-roles.service";

@ApiTags("workspace — roles")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/roles")
export class WorkspaceRolesController {
  constructor(private readonly roles: WorkspaceRolesService) {}

  @Get()
  @ApiOperation({
    summary: "List custom roles in the current workspace (workspace owner)",
    description:
      "Resolves workspace from your latest instagram_integration row (same as GET /workspace/settings).",
  })
  @ApiOkResponse({ type: WorkspaceRolesListResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
  ): Promise<WorkspaceRolesListResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    const items = await this.roles.listForOwner(ownerId, appRole);
    return { items };
  }

  @Post()
  @ApiOperation({
    summary: "Create a role in the current workspace",
    description:
      "Permissions from GET /permissions/catalog. Workspace resolved from your integration.",
  })
  @ApiBody({ type: CreateWorkspaceRoleRequestDto })
  @ApiOkResponse({ type: WorkspaceRoleResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateWorkspaceRoleRequestDto,
  ): Promise<WorkspaceRoleResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    return this.roles.createForOwner(ownerId, dto, appRole);
  }

  @Patch(":roleId")
  @ApiOperation({ summary: "Update role name and/or permissions" })
  @ApiParam({ name: "roleId", type: Number })
  @ApiBody({ type: UpdateWorkspaceRoleRequestDto })
  @ApiOkResponse({ type: WorkspaceRoleResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("roleId") roleIdRaw: string,
    @Body() dto: UpdateWorkspaceRoleRequestDto,
  ): Promise<WorkspaceRoleResponseDto> {
    const { ownerId, appRole } = this.auth(req);
    return this.roles.updateForOwner(
      ownerId,
      this.parsePositiveInt(roleIdRaw, "roleId"),
      dto,
      appRole,
    );
  }

  @Delete(":roleId")
  @ApiOperation({ summary: "Delete a workspace role" })
  @ApiParam({ name: "roleId", type: Number })
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("roleId") roleIdRaw: string,
  ): Promise<{ deleted: true }> {
    const { ownerId, appRole } = this.auth(req);
    await this.roles.deleteForOwner(
      ownerId,
      this.parsePositiveInt(roleIdRaw, "roleId"),
      appRole,
    );
    return { deleted: true };
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
