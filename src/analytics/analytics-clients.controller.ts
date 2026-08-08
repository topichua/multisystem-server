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
import { AnalyticsClientsService } from "./analytics-clients.service";
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import {
  AnalyticsClientsTopQueryDto,
  AnalyticsTopValuableClientsSort,
} from "./dto/analytics-clients-query.dto";
import {
  AnalyticsAcquisitionSourcesResponseDto,
  AnalyticsClientsKpiResponseDto,
  AnalyticsNewVsRepeatResponseDto,
  AnalyticsOneTimeBuyersResponseDto,
  AnalyticsRepeatFunnelResponseDto,
  AnalyticsReturnTimingResponseDto,
  AnalyticsTopValuableClientsResponseDto,
  AnalyticsWinBackResponseDto,
} from "./dto/analytics-clients-response.dto";

@ApiTags("analytics")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("analytics/clients")
export class AnalyticsClientsController {
  constructor(private readonly clients: AnalyticsClientsService) {}

  @Get("kpi")
  @ApiOperation({
    summary: "Customer analytics KPI",
    description:
      "Активні / нові клієнти, повторні покупки %, середня цінність (lifetime), " +
      "замовлень на клієнта, медіана днів до повторної покупки.",
  })
  @ApiOkResponse({ type: AnalyticsClientsKpiResponseDto })
  async getKpi(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsClientsKpiResponseDto> {
    return this.clients.getKpi(this.requireOwnerId(req), query);
  }

  @Get("new-vs-repeat")
  @ApiOperation({
    summary: "New vs repeat customers",
    description:
      "Нові та повторні клієнти: кількість і частка виручки за вибраний період.",
  })
  @ApiOkResponse({ type: AnalyticsNewVsRepeatResponseDto })
  async getNewVsRepeat(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsNewVsRepeatResponseDto> {
    return this.clients.getNewVsRepeat(this.requireOwnerId(req), query);
  }

  @Get("repeat-funnel")
  @ApiOperation({
    summary: "Repeat purchase funnel",
    description:
      "Скільки активних клієнтів періоду зробили 1+ / 2+ / 3+ / 4+ покупок (lifetime count).",
  })
  @ApiOkResponse({ type: AnalyticsRepeatFunnelResponseDto })
  async getRepeatFunnel(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsRepeatFunnelResponseDto> {
    return this.clients.getRepeatFunnel(this.requireOwnerId(req), query);
  }

  @Get("return-timing")
  @ApiOperation({
    summary: "Time to next purchase distribution",
    description:
      "Розподіл днів між 1-ю та 2-ю покупкою (коли клієнти повертаються). Lifetime.",
  })
  @ApiOkResponse({ type: AnalyticsReturnTimingResponseDto })
  async getReturnTiming(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsReturnTimingResponseDto> {
    return this.clients.getReturnTiming(this.requireOwnerId(req), query);
  }

  @Get("win-back")
  @ApiOperation({
    summary: "Customers to win back",
    description:
      "Клієнти, яких варто повернути: давно не купували (≥25 днів) " +
      "відносно свого циклу покупок.",
  })
  @ApiOkResponse({ type: AnalyticsWinBackResponseDto })
  async getWinBack(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsWinBackResponseDto> {
    return this.clients.getWinBack(this.requireOwnerId(req), query);
  }

  @Get("top-valuable")
  @ApiOperation({
    summary: "Most valuable customers",
    description:
      "Найцінніші клієнти: виручка за період + цінність за весь час. sort + limit (max 50).",
  })
  @ApiOkResponse({ type: AnalyticsTopValuableClientsResponseDto })
  async getTopValuable(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsClientsTopQueryDto,
  ): Promise<AnalyticsTopValuableClientsResponseDto> {
    const result = await this.clients.getTopValuable(
      this.requireOwnerId(req),
      query,
    );
    return {
      currency: result.currency,
      sort: result.sort ?? AnalyticsTopValuableClientsSort.lifetimeValue,
      customers: result.customers,
    };
  }

  @Get("acquisition-sources")
  @ApiOperation({
    summary: "New customer acquisition sources",
    description:
      "Звідки приходять нові клієнти: канал першої покупки (без revenue).",
  })
  @ApiOkResponse({ type: AnalyticsAcquisitionSourcesResponseDto })
  async getAcquisitionSources(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsAcquisitionSourcesResponseDto> {
    return this.clients.getAcquisitionSources(this.requireOwnerId(req), query);
  }

  @Get("one-time")
  @ApiOperation({
    summary: "One-time buyers",
    description:
      "Клієнти без повторної покупки (lifetime рівно 1 замовлення) + частка бази.",
  })
  @ApiOkResponse({ type: AnalyticsOneTimeBuyersResponseDto })
  async getOneTimeBuyers(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsOneTimeBuyersResponseDto> {
    return this.clients.getOneTimeBuyers(this.requireOwnerId(req), query);
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
