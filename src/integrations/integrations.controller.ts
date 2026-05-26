import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { INTEGRATION_TYPES } from "./integration-type";
import { CreateIntegrationRequestDto } from "./dto/http/create-integration-request.dto";
import { CreateIntegrationResponseDto } from "./dto/http/create-integration-response.dto";
import { IntegrationsListResponseDto } from "./dto/http/integrations-list-response.dto";
import { IntegrationsService } from "./integrations.service";

@ApiTags("integrations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @ApiOperation({
    summary: "List integrations for a workspace",
    description:
      "Returns connected-channel integrations for the current user's workspace. " +
      "Today this includes Instagram rows from `instagram_integration`. " +
      "Omit `workspace_id` to use the workspace from your latest integration row.",
  })
  @ApiQuery({
    name: "workspace_id",
    required: false,
    description:
      "Workspace to list; must belong to the authenticated owner. Defaults to your primary workspace.",
    schema: { type: "integer", minimum: 1 },
  })
  @ApiOkResponse({ type: IntegrationsListResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Query("workspace_id") workspaceIdRaw?: string,
  ): Promise<IntegrationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }

    let workspaceId: number | undefined;
    if (workspaceIdRaw != null && workspaceIdRaw.trim() !== "") {
      workspaceId = Number(workspaceIdRaw.trim());
      if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
        throw new BadRequestException("workspace_id must be a positive integer");
      }
    }

    return this.integrations.listForOwner(ownerId, workspaceId);
  }

  @Post()
  @ApiOperation({
    summary: "Start connecting an integration (returns OAuth URL)",
    description:
      "For `instagram`, returns a Facebook Login URL to open in a new browser window. " +
      "After OAuth completes, call GET /integrations to see `connectedAt`.",
  })
  @ApiCreatedResponse({ type: CreateIntegrationResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateIntegrationRequestDto,
  ): Promise<CreateIntegrationResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.integrations.startForOwner(ownerId, dto);
  }

  @Delete(":type/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete an integration by type and id",
    description:
      "Removes the integration row for the authenticated owner. " +
      "`instagram` deletes from `instagram_integration` (fails with 409 if catalog source references still point at it). " +
      "`telegram` detaches the live session and deletes from `telegram_integrations`.",
  })
  @ApiParam({ name: "type", enum: INTEGRATION_TYPES })
  @ApiParam({ name: "id", type: Number })
  @ApiNoContentResponse()
  async delete(
    @Req() req: { user?: AuthUser },
    @Param("type") type: string,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    await this.integrations.deleteForOwner(ownerId, type, id);
  }
}
