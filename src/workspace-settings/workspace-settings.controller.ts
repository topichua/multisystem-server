import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import { WorkspaceSettingsResponseDto } from "./dto/workspace-settings-response.dto";
import { WorkspaceSettingsService } from "./workspace-settings.service";

@ApiTags("workspace")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/settings")
export class WorkspaceSettingsController {
  constructor(private readonly settings: WorkspaceSettingsService) {}

  @Get()
  @ApiOperation({
    summary: "Get workspace settings",
    description:
      "Resolves the workspace from your latest integration (`integration.workspace_id`).",
  })
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  async get(
    @Req() req: { user?: AuthUser },
  ): Promise<WorkspaceSettingsResponseDto> {
    return this.settings.getForOwner(this.requireNumericOwnerId(req));
  }

  @Patch()
  @ApiOperation({ summary: "Update workspace settings" })
  @ApiBody({ type: UpdateWorkspaceSettingsDto })
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  async patch(
    @Req() req: { user?: AuthUser },
    @Body() dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettingsResponseDto> {
    return this.settings.updateForOwner(this.requireNumericOwnerId(req), dto);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
