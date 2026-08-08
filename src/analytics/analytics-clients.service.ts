import { Injectable } from "@nestjs/common";
import { AnalyticsFilterBuilder } from "./filters/analytics-filter.builder";
import { ClientsKpiCalculator } from "./calculators/clients/clients-kpi.calculator";
import { NewVsRepeatClientsCalculator } from "./calculators/clients/new-vs-repeat-clients.calculator";
import { RepeatPurchaseFunnelCalculator } from "./calculators/clients/repeat-purchase-funnel.calculator";
import { ReturnTimingCalculator } from "./calculators/clients/return-timing.calculator";
import { WinBackClientsCalculator } from "./calculators/clients/win-back-clients.calculator";
import { TopValuableClientsCalculator } from "./calculators/clients/top-valuable-clients.calculator";
import { ClientAcquisitionSourcesCalculator } from "./calculators/clients/client-acquisition-sources.calculator";
import { OneTimeBuyersCalculator } from "./calculators/clients/one-time-buyers.calculator";
import type { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import type {
  AnalyticsClientsTopQueryDto,
} from "./dto/analytics-clients-query.dto";
import { AnalyticsTopValuableClientsSort } from "./dto/analytics-clients-query.dto";
import type {
  AnalyticsAcquisitionSourcesResult,
  AnalyticsClientsKpiResult,
  AnalyticsNewVsRepeatResult,
  AnalyticsOneTimeBuyersResult,
  AnalyticsRepeatFunnelResult,
  AnalyticsReturnTimingResult,
  AnalyticsTopValuableClientsResult,
  AnalyticsWinBackResult,
} from "./types/analytics-clients.types";

@Injectable()
export class AnalyticsClientsService {
  constructor(
    private readonly filterBuilder: AnalyticsFilterBuilder,
    private readonly kpi: ClientsKpiCalculator,
    private readonly newVsRepeat: NewVsRepeatClientsCalculator,
    private readonly funnel: RepeatPurchaseFunnelCalculator,
    private readonly returnTiming: ReturnTimingCalculator,
    private readonly winBack: WinBackClientsCalculator,
    private readonly topValuable: TopValuableClientsCalculator,
    private readonly acquisition: ClientAcquisitionSourcesCalculator,
    private readonly oneTime: OneTimeBuyersCalculator,
  ) {}

  async getKpi(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsClientsKpiResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.kpi.calculate(context);
  }

  async getNewVsRepeat(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsNewVsRepeatResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.newVsRepeat.calculate(context);
  }

  async getRepeatFunnel(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsRepeatFunnelResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.funnel.calculate(context);
  }

  async getReturnTiming(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsReturnTimingResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.returnTiming.calculate(context);
  }

  async getWinBack(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsWinBackResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.winBack.calculate(context);
  }

  async getTopValuable(
    ownerId: number,
    query: AnalyticsClientsTopQueryDto,
  ): Promise<
    AnalyticsTopValuableClientsResult & {
      sort: AnalyticsTopValuableClientsSort;
    }
  > {
    const context = await this.filterBuilder.build(ownerId, query);
    const sort =
      query.sort ?? AnalyticsTopValuableClientsSort.lifetimeValue;
    const result = await this.topValuable.calculate(context, {
      sort,
      limit: query.limit,
    });
    return {
      ...result,
      sort,
    };
  }

  async getAcquisitionSources(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsAcquisitionSourcesResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.acquisition.calculate(context);
  }

  async getOneTimeBuyers(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsOneTimeBuyersResult> {
    const context = await this.filterBuilder.build(ownerId, query);
    return this.oneTime.calculate(context);
  }
}
