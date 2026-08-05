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
  Patch,
  Post,
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
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { INTEGRATION_TYPES } from "./integration-type";
import { CreateIntegrationRequestDto } from "./dto/http/create-integration-request.dto";
import { CreateIntegrationResponseDto } from "./dto/http/create-integration-response.dto";
import { IntegrationsListResponseDto } from "./dto/http/integrations-list-response.dto";
import { IntegrationListItemDto } from "./dto/http/integration-list-item.dto";
import { UpdateChannelChatAutoDistributionRequestDto } from "./dto/http/update-channel-chat-auto-distribution.dto";
import {
  ConfirmInstagramIntegrationRequestDto,
  ConfirmInstagramIntegrationResponseDto,
  InstagramOAuthPendingPollResponseDto,
} from "./dto/http/instagram-oauth-pending.dto";
import { TikTokOAuthPendingPollResponseDto } from "./dto/http/tiktok-oauth-pending.dto";
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
      "Returns connected-channel integrations for the current user's workspace " +
      "(Instagram, TikTok, Telegram, Nova Poshta). " +
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
        throw new BadRequestException(
          "workspace_id must be a positive integer",
        );
      }
    }

    return this.integrations.listForOwner(ownerId, workspaceId);
  }

  @Post()
  @ApiOperation({
    summary: "Start connecting an integration (returns OAuth URL)",
    description:
      "For `instagram`, returns Facebook Login `url` + correlation `sessionId`. " +
      "Open `url` (popup/new tab). Poll GET /integrations/instagram/oauth/pages?sessionId=… " +
      "every few seconds until `status` is `select_page`, then POST /integrations/instagram/oauth/confirm. " +
      "For `tiktok`, returns TikTok Login Kit `url` + `sessionId`. Poll " +
      "GET /integrations/tiktok/oauth/status?sessionId=… until `status` is `connected`.",
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

  @Get("instagram/oauth/pages")
  @ApiOperation({
    summary: "Poll Instagram OAuth pending session (pages ready?)",
    description:
      "Client should poll with the `sessionId` from POST /integrations. " +
      "`awaiting_facebook` → keep polling. `select_page` → show `pages`. `failed` → restart connect.",
  })
  @ApiQuery({ name: "sessionId", required: true, format: "uuid" })
  @ApiOkResponse({ type: InstagramOAuthPendingPollResponseDto })
  async listInstagramOAuthPages(
    @Req() req: { user?: AuthUser },
    @Query("sessionId") sessionId: string,
  ): Promise<InstagramOAuthPendingPollResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.integrations.listInstagramOAuthPagesForOwner(
      ownerId,
      sessionId,
    );
  }

  @Post("instagram/oauth/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm Instagram integration for a selected Facebook Page",
    description:
      "Step 3: creates/updates `instagram_integration` for the chosen Page from a pending OAuth session.",
  })
  @ApiBody({ type: ConfirmInstagramIntegrationRequestDto })
  @ApiOkResponse({ type: ConfirmInstagramIntegrationResponseDto })
  async confirmInstagramOAuth(
    @Req() req: { user?: AuthUser },
    @Body() dto: ConfirmInstagramIntegrationRequestDto,
  ): Promise<ConfirmInstagramIntegrationResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.integrations.confirmInstagramOAuthForOwner(ownerId, dto);
  }

  @Get("tiktok/oauth/status")
  @ApiOperation({
    summary: "Poll TikTok OAuth pending session",
    description:
      "Client should poll with the `sessionId` from POST /integrations (`integration_type: tiktok`). " +
      "`awaiting_tiktok` → keep polling. `connected` → integration ready. `failed` → restart connect.",
  })
  @ApiQuery({ name: "sessionId", required: true, format: "uuid" })
  @ApiOkResponse({ type: TikTokOAuthPendingPollResponseDto })
  async pollTikTokOAuthStatus(
    @Req() req: { user?: AuthUser },
    @Query("sessionId") sessionId: string,
  ): Promise<TikTokOAuthPendingPollResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.integrations.pollTikTokOAuthStatusForOwner(ownerId, sessionId);
  }

  @Patch(":type/:id")
  @ApiOperation({
    summary: "Update channel auto-distribution setting",
    description:
      "Sets `chat_auto_distribution` for Instagram or Telegram channels. " +
      "When enabled, new live chats are assigned to a member with `work_status=accepting_new_chats` " +
      "who has `canTakeChat` («Брати непризначені») for this channel, full conversation access, or is the owner. " +
      "Emits conversation event `responsible_changed` with `source: auto_distribution`.",
  })
  @ApiParam({ name: "type", enum: ["instagram", "telegram"] })
  @ApiParam({ name: "id", type: Number })
  @ApiBody({ type: UpdateChannelChatAutoDistributionRequestDto })
  @ApiOkResponse({ type: IntegrationListItemDto })
  async updateChatAutoDistribution(
    @Req() req: { user?: AuthUser },
    @Param("type") type: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateChannelChatAutoDistributionRequestDto,
  ): Promise<IntegrationListItemDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.integrations.updateChatAutoDistributionForOwner(
      ownerId,
      type,
      id,
      dto.chat_auto_distribution,
      req.user?.role,
    );
  }

  @Delete(":type/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Disconnect an integration",
    description:
      "**Instagram:** revokes Meta app permissions (best effort) and deletes the `instagram_integration` row. " +
      "Reconnect with `POST /integrations` → Facebook Login → select Page → confirm. " +
      "**TikTok:** revokes TikTok tokens (best effort) and deletes the `tiktok_integrations` row. " +
      "**Telegram:** detaches the live session and removes the `telegram_integrations` row.",
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
