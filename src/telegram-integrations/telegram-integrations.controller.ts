import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ConfirmTelegramCodeRequestDto } from "./dto/http/confirm-telegram-code-request.dto";
import { ConfirmTelegramPasswordRequestDto } from "./dto/http/confirm-telegram-password-request.dto";
import { StartTelegramIntegrationRequestDto } from "./dto/http/start-telegram-integration-request.dto";
import { TelegramDialogsListResponseDto } from "./dto/http/telegram-dialog-response.dto";
import { TelegramIntegrationResponseDto } from "./dto/http/telegram-integration-response.dto";
import { TelegramIntegrationsListResponseDto } from "./dto/http/telegram-integrations-list-response.dto";
import { TelegramIntegrationsService } from "./telegram-integrations.service";

@ApiTags("telegram-integrations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("telegram-integrations")
export class TelegramIntegrationsController {
  constructor(private readonly telegram: TelegramIntegrationsService) {}

  @Get()
  @ApiOperation({
    summary: "List personal Telegram account integrations for a workspace",
    description:
      "User-account (MTProto) links — not Bot API. Requires TELEGRAM_API_ID / TELEGRAM_API_HASH.",
  })
  @ApiQuery({ name: "workspace_id", required: false, schema: { type: "integer" } })
  @ApiOkResponse({ type: TelegramIntegrationsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
    @Query("workspace_id") workspaceIdRaw?: string,
  ): Promise<TelegramIntegrationsListResponseDto> {
    return this.telegram.listForOwner(
      this.requireOwnerId(req),
      this.parseOptionalWorkspaceId(workspaceIdRaw),
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one Telegram integration" })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: TelegramIntegrationResponseDto })
  getOne(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<TelegramIntegrationResponseDto> {
    return this.telegram.getOneForOwner(
      this.requireOwnerId(req),
      this.parseId(id),
    );
  }

  @Post()
  @ApiOperation({
    summary: "Start linking a personal Telegram account",
    description:
      "Sends a login code to the Telegram app/SMS. Then call POST :id/confirm-code with the code. " +
      "If the account has 2FA, call POST :id/confirm-password.",
  })
  @ApiCreatedResponse({ type: TelegramIntegrationResponseDto })
  start(
    @Req() req: { user?: AuthUser },
    @Body() dto: StartTelegramIntegrationRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    return this.telegram.startForOwner(this.requireOwnerId(req), dto);
  }

  @Post(":id/confirm-code")
  @ApiOperation({ summary: "Submit Telegram login code" })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: TelegramIntegrationResponseDto })
  confirmCode(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: ConfirmTelegramCodeRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    return this.telegram.confirmCodeForOwner(
      this.requireOwnerId(req),
      this.parseId(id),
      dto,
    );
  }

  @Post(":id/confirm-password")
  @ApiOperation({ summary: "Submit Telegram 2FA password" })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: TelegramIntegrationResponseDto })
  confirmPassword(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: ConfirmTelegramPasswordRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    return this.telegram.confirmPasswordForOwner(
      this.requireOwnerId(req),
      this.parseId(id),
      dto,
    );
  }

  @Get(":id/dialogs")
  @ApiOperation({
    summary: "List Telegram dialogs (private chats and groups)",
    description:
      "Uses the stored user session — proves access to the account inbox. " +
      "Filter client-side with `isUser` for private DMs.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer" } })
  @ApiOkResponse({ type: TelegramDialogsListResponseDto })
  listDialogs(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Query("limit") limitRaw?: string,
  ): Promise<TelegramDialogsListResponseDto> {
    const limit =
      limitRaw != null && limitRaw.trim() !== ""
        ? Number(limitRaw.trim())
        : undefined;
    return this.telegram.listDialogsForOwner(
      this.requireOwnerId(req),
      this.parseId(id),
      limit,
    );
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Disconnect Telegram account (clears stored session)",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: TelegramIntegrationResponseDto })
  disconnect(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<TelegramIntegrationResponseDto> {
    return this.telegram.disconnectForOwner(
      this.requireOwnerId(req),
      this.parseId(id),
    );
  }

  private requireOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }

  private parseId(raw: string): number {
    const id = Number(raw.trim());
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    return id;
  }

  private parseOptionalWorkspaceId(raw?: string): number | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const workspaceId = Number(raw.trim());
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }
    return workspaceId;
  }
}
