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
import { StartTelegramQrLoginRequestDto } from "./dto/http/start-telegram-qr-login-request.dto";
import { StartTelegramQrLoginResponseDto } from "./dto/http/start-telegram-qr-login-response.dto";
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
      "Sends a login code to the Telegram app on a logged-in device (not SMS). " +
      "Then call POST :id/confirm-code with the code. " +
      "Third-party apps cannot request SMS codes (force_sms is ignored when unavailable). " +
      "If the account has 2FA, call POST :id/confirm-password. " +
      "For login without phone/SMS, use POST /telegram-integrations/qr-login/start.",
  })
  @ApiCreatedResponse({ type: TelegramIntegrationResponseDto })
  start(
    @Req() req: { user?: AuthUser },
    @Body() dto: StartTelegramIntegrationRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    return this.telegram.startForOwner(this.requireOwnerId(req), dto);
  }

  @Post("qr-login/start")
  @ApiOperation({
    summary: "Start Telegram QR login",
    description:
      "Creates a GramJS client session, exports a Telegram login QR token, and stores a " +
      "`telegram_integrations` row in `pending_qr` status. Encode `qrLoginUrl` as a QR code " +
      "for the user to scan in the Telegram mobile app (Settings → Devices → Link Desktop Device). " +
      "After scanning, call POST /telegram-integrations/:id/qr-login/confirm.",
  })
  @ApiCreatedResponse({ type: StartTelegramQrLoginResponseDto })
  startQrLogin(
    @Req() req: { user?: AuthUser },
    @Body() dto: StartTelegramQrLoginRequestDto,
  ): Promise<StartTelegramQrLoginResponseDto> {
    return this.telegram.startQrLoginForOwner(
      this.requireOwnerId(req),
      dto.workspace_id,
    );
  }

  @Post(":id/qr-login/confirm")
  @ApiOperation({
    summary: "Complete Telegram QR login after scan",
    description:
      "Call this immediately when showing the QR (do not wait for the user to scan first). " +
      "The request blocks up to `wait_seconds` while Telegram confirms the scan. " +
      "QR tokens expire in ~30 seconds — if you get 400 AUTH_TOKEN_EXPIRED, call qr-login/start again.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiQuery({
    name: "wait_seconds",
    required: false,
    schema: { type: "integer", minimum: 5, maximum: 120, default: 90 },
    description: "How long to wait for the QR scan before returning an error.",
  })
  @ApiOkResponse({ type: TelegramIntegrationResponseDto })
  confirmQrLogin(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Query("wait_seconds") waitSecondsRaw?: string,
  ): Promise<TelegramIntegrationResponseDto> {
    const waitSeconds =
      waitSecondsRaw != null && waitSecondsRaw.trim() !== ""
        ? Number(waitSecondsRaw.trim())
        : 90;
    const waitTimeoutMs =
      Number.isFinite(waitSeconds) && waitSeconds > 0
        ? Math.min(Math.max(Math.floor(waitSeconds), 5), 120) * 1000
        : 90_000;

    return this.telegram.confirmQrLoginForOwner(
      this.requireOwnerId(req),
      this.parseId(id),
      waitTimeoutMs,
    );
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
