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
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  ConnectNovaPoshtaIntegrationRequestDto,
  NovaPoshtaIntegrationResponseDto,
} from "./dto/connect-novaposhta-integration.dto";
import { NovaPoshtaIntegrationDetailsResponseDto } from "./dto/novaposhta-integration-details.dto";
import { NovaPoshtaIntegrationsService } from "./novaposhta-integrations.service";

@ApiTags("novaposhta-integrations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("novaposhta-integrations")
export class NovaPoshtaIntegrationsController {
  constructor(private readonly novaPoshta: NovaPoshtaIntegrationsService) {}

  @Post()
  @ApiOperation({
    summary: "Connect Nova Poshta API key",
    description:
      "Creates or updates the Nova Poshta integration for the current workspace (one per workspace).",
  })
  @ApiCreatedResponse({ type: NovaPoshtaIntegrationResponseDto })
  async connect(
    @Req() req: { user?: AuthUser },
    @Body() dto: ConnectNovaPoshtaIntegrationRequestDto,
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    return this.novaPoshta.connectForOwner(this.requireOwnerId(req), dto);
  }

  @Get()
  @ApiOperation({ summary: "Get Nova Poshta integration for current workspace" })
  @ApiOkResponse({ type: NovaPoshtaIntegrationResponseDto })
  async get(
    @Req() req: { user?: AuthUser },
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    return this.novaPoshta.getForOwner(this.requireOwnerId(req));
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get Nova Poshta integration details by id",
    description:
      "Returns stored integration fields and live sender/recipient data from Nova Poshta API: counterparty, phone, contact person, departure city, and warehouse branch.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: NovaPoshtaIntegrationDetailsResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<NovaPoshtaIntegrationDetailsResponseDto> {
    return this.novaPoshta.getByIdForOwner(this.requireOwnerId(req), id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove Nova Poshta integration" })
  @ApiParam({ name: "id", type: Number })
  @ApiNoContentResponse()
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    await this.novaPoshta.deleteForOwner(this.requireOwnerId(req), id);
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
}
