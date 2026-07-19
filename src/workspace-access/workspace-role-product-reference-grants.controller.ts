import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
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
  ReplaceWorkspaceRoleProductReferenceGrantsRequestDto,
  WorkspaceRoleProductReferenceGrantsResponseDto,
} from "./dto/http/workspace-role-product-reference-grants.dto";
import { WorkspaceRoleProductReferenceGrantsService } from "./workspace-role-product-reference-grants.service";

@ApiTags("workspace — roles")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/roles/:roleId/product-reference-grants")
export class WorkspaceRoleProductReferenceGrantsController {
  constructor(
    private readonly grants: WorkspaceRoleProductReferenceGrantsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List product reference grants for a role",
    description:
      "Returns every workspace integration with this role's product-reference manage flag. " +
      "Requires workspace owner or `workspace.roles` permission.",
  })
  @ApiParam({ name: "roleId", type: Number })
  @ApiOkResponse({ type: WorkspaceRoleProductReferenceGrantsResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Param("roleId") roleIdRaw: string,
  ): Promise<WorkspaceRoleProductReferenceGrantsResponseDto> {
    const { userId, appRole } = this.auth(req);
    return this.grants.listForRole(
      userId,
      this.parsePositiveInt(roleIdRaw, "roleId"),
      appRole,
    );
  }

  @Put()
  @ApiOperation({
    summary: "Replace product reference grants for a role",
    description:
      "Replaces the full grant list. Omitting or setting canManage=false denies that channel. " +
      "Requires workspace owner or `workspace.roles` permission.",
  })
  @ApiParam({ name: "roleId", type: Number })
  @ApiBody({ type: ReplaceWorkspaceRoleProductReferenceGrantsRequestDto })
  @ApiOkResponse({ type: WorkspaceRoleProductReferenceGrantsResponseDto })
  async replace(
    @Req() req: { user?: AuthUser },
    @Param("roleId") roleIdRaw: string,
    @Body() dto: ReplaceWorkspaceRoleProductReferenceGrantsRequestDto,
  ): Promise<WorkspaceRoleProductReferenceGrantsResponseDto> {
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
        "Current authorized user does not contain numeric owner id",
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
