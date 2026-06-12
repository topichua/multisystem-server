import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ResolvedUserPermissionsResponseDto } from "./dto/http/resolved-user-permissions-response.dto";
import { WorkspacePermissionsService } from "./workspace-permissions.service";

@ApiTags("workspace — permissions")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/permissions")
export class WorkspacePermissionsController {
  constructor(private readonly permissions: WorkspacePermissionsService) {}

  @Get("me")
  @ApiOperation({
    summary: "Resolved permissions for the current user",
    description:
      "Returns a typed permission object for the current workspace. " +
      "Workspace owners receive full access (`isOwner: true`).",
  })
  @ApiQuery({
    name: "workspace_id",
    required: false,
    type: Number,
    description: "Optional explicit workspace id.",
  })
  @ApiOkResponse({ type: ResolvedUserPermissionsResponseDto })
  async getMyPermissions(
    @Req() req: { user?: AuthUser },
    @Query("workspace_id") workspaceIdRaw?: string,
  ): Promise<ResolvedUserPermissionsResponseDto> {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric user id",
      );
    }
    const workspaceId = this.parseOptionalPositiveInt(workspaceIdRaw);
    return this.permissions.getResolvedForUser(
      userId,
      req.user?.role,
      workspaceId,
    );
  }

  private parseOptionalPositiveInt(raw?: string): number | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }
    return n;
  }
}
