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
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  NovaPoshtaSettlementSearchItemDto,
  NovaPoshtaStreetSearchItemDto,
  NovaPoshtaWarehouseSearchItemDto,
} from "./dto/nova-poshta-search-response.dto";
import { SearchNovaPoshtaSettlementsQueryDto } from "./dto/search-novaposhta-settlements-query.dto";
import { SearchNovaPoshtaStreetsQueryDto } from "./dto/search-novaposhta-streets-query.dto";
import { SearchNovaPoshtaWarehousesQueryDto } from "./dto/search-novaposhta-warehouses-query.dto";
import { NovaPoshtaIntegrationsService } from "./novaposhta-integrations.service";

const SEARCH_CREDENTIALS_HINT =
  "Authenticate with exactly one of `api_key` (setup flow) or `nova_poshta_integration_id` (loads API key from DB).";

@ApiTags("nova-poshta")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("nova-poshta")
export class NovaPoshtaSearchController {
  constructor(private readonly novaPoshta: NovaPoshtaIntegrationsService) {}

  @Get("settlements/search")
  @ApiOperation({
    summary: "Search Nova Poshta settlements by name",
    description:
      `${SEARCH_CREDENTIALS_HINT} Returns an empty array when query is empty.`,
  })
  @ApiOkResponse({ type: [NovaPoshtaSettlementSearchItemDto] })
  async searchSettlements(
    @Req() req: { user?: AuthUser },
    @Query() query: SearchNovaPoshtaSettlementsQueryDto,
  ): Promise<NovaPoshtaSettlementSearchItemDto[]> {
    const ownerId = this.requireOwnerId(req);
    const apiKey = await this.novaPoshta.resolveSearchApiKeyForOwner(
      ownerId,
      query,
    );
    return this.novaPoshta.searchSettlementsByApiKey(apiKey, query.query);
  }

  @Get("warehouses/search")
  @ApiOperation({
    summary: "Search Nova Poshta warehouses, branches and parcel lockers",
    description:
      `${SEARCH_CREDENTIALS_HINT} \`cityRef\` accepts settlement \`ref\` or delivery \`cityRef\` from settlement search.`,
  })
  @ApiOkResponse({ type: [NovaPoshtaWarehouseSearchItemDto] })
  async searchWarehouses(
    @Req() req: { user?: AuthUser },
    @Query() query: SearchNovaPoshtaWarehousesQueryDto,
  ): Promise<NovaPoshtaWarehouseSearchItemDto[]> {
    const ownerId = this.requireOwnerId(req);
    const apiKey = await this.novaPoshta.resolveSearchApiKeyForOwner(
      ownerId,
      query,
    );
    return this.novaPoshta.searchWarehousesByApiKey(
      apiKey,
      query.cityRef,
      query.query,
      query.type ?? "all",
    );
  }

  @Get("streets/search")
  @ApiOperation({
    summary: "Search streets in a Nova Poshta settlement",
    description: `${SEARCH_CREDENTIALS_HINT} Returns an empty array when query is empty.`,
  })
  @ApiOkResponse({ type: [NovaPoshtaStreetSearchItemDto] })
  async searchStreets(
    @Req() req: { user?: AuthUser },
    @Query() query: SearchNovaPoshtaStreetsQueryDto,
  ): Promise<NovaPoshtaStreetSearchItemDto[]> {
    const ownerId = this.requireOwnerId(req);
    const apiKey = await this.novaPoshta.resolveSearchApiKeyForOwner(
      ownerId,
      query,
    );
    return this.novaPoshta.searchStreetsByApiKey(
      apiKey,
      query.settlementRef,
      query.query,
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
}
