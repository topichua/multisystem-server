import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  ConnectMonobankIntegrationDto,
  UpdateMonobankIntegrationDto,
} from "./dto/connect-monobank-integration.dto";
import {
  PaymentIntegrationResponseDto,
  PaymentIntegrationsListResponseDto,
} from "./dto/payment-integration-response.dto";
import { PaymentIntegrationsService } from "./payment-integrations.service";

@ApiTags("workspace")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/payment-integrations")
export class PaymentIntegrationsController {
  constructor(private readonly integrations: PaymentIntegrationsService) {}

  @Get()
  @ApiOperation({ summary: "List payment integrations for workspace" })
  @ApiOkResponse({ type: PaymentIntegrationsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
  ): Promise<PaymentIntegrationsListResponseDto> {
    const userId = this.requireUserId(req);
    return this.integrations.listForUser(userId, req.user?.role);
  }

  @Post("monobank/connect")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Connect Monobank Acquiring integration" })
  @ApiOkResponse({ type: PaymentIntegrationResponseDto })
  connectMonobank(
    @Req() req: { user?: AuthUser },
    @Body() dto: ConnectMonobankIntegrationDto,
  ): Promise<PaymentIntegrationResponseDto> {
    const userId = this.requireUserId(req);
    return this.integrations.connectMonobank(userId, dto, req.user?.role);
  }

  @Patch("monobank/:integrationId")
  @ApiOperation({ summary: "Update Monobank integration" })
  @ApiParam({ name: "integrationId", type: Number })
  @ApiOkResponse({ type: PaymentIntegrationResponseDto })
  updateMonobank(
    @Req() req: { user?: AuthUser },
    @Param("integrationId", ParseIntPipe) integrationId: number,
    @Body() dto: UpdateMonobankIntegrationDto,
  ): Promise<PaymentIntegrationResponseDto> {
    const userId = this.requireUserId(req);
    return this.integrations.updateMonobank(
      userId,
      integrationId,
      dto,
      req.user?.role,
    );
  }

  @Post(":integrationId/check-connection")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify payment integration connection" })
  @ApiParam({ name: "integrationId", type: Number })
  @ApiOkResponse({ type: PaymentIntegrationResponseDto })
  checkConnection(
    @Req() req: { user?: AuthUser },
    @Param("integrationId", ParseIntPipe) integrationId: number,
  ): Promise<PaymentIntegrationResponseDto> {
    const userId = this.requireUserId(req);
    return this.integrations.checkConnection(
      userId,
      integrationId,
      req.user?.role,
    );
  }

  @Post(":integrationId/set-default")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set default payment provider" })
  @ApiParam({ name: "integrationId", type: Number })
  @ApiOkResponse({ type: PaymentIntegrationResponseDto })
  setDefault(
    @Req() req: { user?: AuthUser },
    @Param("integrationId", ParseIntPipe) integrationId: number,
  ): Promise<PaymentIntegrationResponseDto> {
    const userId = this.requireUserId(req);
    return this.integrations.setDefault(userId, integrationId, req.user?.role);
  }

  @Post(":integrationId/disconnect")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Disconnect payment integration (soft)" })
  @ApiParam({ name: "integrationId", type: Number })
  @ApiOkResponse({ type: PaymentIntegrationResponseDto })
  disconnect(
    @Req() req: { user?: AuthUser },
    @Param("integrationId", ParseIntPipe) integrationId: number,
  ): Promise<PaymentIntegrationResponseDto> {
    const userId = this.requireUserId(req);
    return this.integrations.disconnect(userId, integrationId, req.user?.role);
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException("Unauthorized");
    }
    return userId;
  }
}
