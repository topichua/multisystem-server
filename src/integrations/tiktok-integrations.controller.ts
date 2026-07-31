import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { TikTokConnectResponseDto } from "./dto/http/tiktok-connect-response.dto";
import { TikTokOAuthConnectService } from "./tiktok-oauth-connect.service";

@ApiTags("tiktok-integrations")
@Controller()
export class TikTokIntegrationsController {
  constructor(private readonly tikTokOAuth: TikTokOAuthConnectService) {}

  @Post("workspaces/:workspaceId/integrations/tiktok/connect")
  @ApiBearerAuth("bearer")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Start TikTok OAuth connect for a workspace",
    description:
      "Validates workspace access, persists a one-time OAuth state (10 min TTL), " +
      "and returns the TikTok Login Kit authorize URL. Tokens are never returned here.",
  })
  @ApiParam({ name: "workspaceId", type: Number })
  @ApiOkResponse({ type: TikTokConnectResponseDto })
  async connect(
    @Req() req: { user?: AuthUser },
    @Param("workspaceId", ParseIntPipe) workspaceId: number,
  ): Promise<TikTokConnectResponseDto> {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.tikTokOAuth.startConnect(userId, workspaceId, req.user?.role);
  }

  @Get("integrations/tiktok/callback")
  @ApiOperation({
    summary: "TikTok OAuth redirect URI",
    description:
      "Validates one-time state, exchanges `code` for tokens, encrypts and stores them, " +
      "then redirects to APP_URL/settings/integrations/tiktok?status=success|error.",
  })
  @ApiQuery({ name: "code", required: false })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({ name: "error", required: false })
  @ApiQuery({ name: "error_description", required: false })
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const status = await this.tikTokOAuth.handleCallback(code, state, error);
    try {
      const redirectTo = this.tikTokOAuth.frontendRedirectUrl(status);
      res.redirect(302, redirectTo);
    } catch {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .type("html")
        .send("<p>APP_URL is not configured</p>");
    }
  }
}
