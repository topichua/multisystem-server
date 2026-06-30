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
import { UpdateNovaPoshtaIntegrationRequestDto } from "./dto/update-novaposhta-integration.dto";
import {
  DiscoverNovaPoshtaSendersRequestDto,
  DiscoverNovaPoshtaSendersResponseDto,
} from "./dto/discover-novaposhta-senders.dto";
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
      "Creates or updates the Nova Poshta integration for the current workspace (one per workspace). Validates API key and sender_warehouse_ref; when both city and warehouse refs are sent, checks they match.",
  })
  @ApiCreatedResponse({ type: NovaPoshtaIntegrationResponseDto })
  async connect(
    @Req() req: { user?: AuthUser },
    @Body() dto: ConnectNovaPoshtaIntegrationRequestDto,
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    return this.novaPoshta.connectForOwner(this.requireOwnerId(req), dto);
  }

  @Post("discover-senders")
  @ApiOperation({
    summary: "Discover Nova Poshta senders and contact persons",
    description:
      "Provide exactly one of `api_key` (setup flow) or `nova_poshta_integration_id` (loads API key from DB). " +
      "Fetches sender counterparties, contact persons, and departure points from Nova Poshta API.",
  })
  @ApiOkResponse({ type: DiscoverNovaPoshtaSendersResponseDto })
  async discoverSenders(
    @Req() req: { user?: AuthUser },
    @Body() dto: DiscoverNovaPoshtaSendersRequestDto,
  ): Promise<DiscoverNovaPoshtaSendersResponseDto> {
    return this.novaPoshta.discoverSendersForOwner(this.requireOwnerId(req), dto);
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
      "Returns stored integration fields (including default sender settings) and live sender/recipient data from Nova Poshta API.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: NovaPoshtaIntegrationDetailsResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<NovaPoshtaIntegrationDetailsResponseDto> {
    return this.novaPoshta.getByIdForOwner(this.requireOwnerId(req), id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update Nova Poshta integration settings",
    description:
      "Updates API key, display name, and/or default sender / payment settings stored on the integration row.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: NovaPoshtaIntegrationResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateNovaPoshtaIntegrationRequestDto,
  ): Promise<NovaPoshtaIntegrationResponseDto> {
    return this.novaPoshta.updateForOwner(this.requireOwnerId(req), id, dto);
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
