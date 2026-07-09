import { Injectable } from "@nestjs/common";
import { WorkspaceSettingsService } from "../../workspace-settings/workspace-settings.service";
import { WorkspaceAccessContextService } from "../../workspace-access/workspace-access-context.service";
import { AnalyticsDateRangeService } from "../date-range/analytics-date-range.service";
import type { AnalyticsFilterContext } from "../types/analytics-filter-context";
import type { AnalyticsQueryDto } from "../dto/analytics-query.dto";

@Injectable()
export class AnalyticsFilterBuilder {
  constructor(
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly workspaceSettings: WorkspaceSettingsService,
    private readonly dateRangeService: AnalyticsDateRangeService,
  ) {}

  async build(
    ownerId: number,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsFilterContext> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const currency =
      await this.workspaceSettings.getDefaultCurrencyForOwner(ownerId);
    const ranges = this.dateRangeService.resolveRanges({
      period: query.period,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    return {
      workspaceId: workspace.id,
      currency,
      ranges,
      channelIds: query.channelIds,
      managerIds: query.managerIds,
      orderStatusIds: query.orderStatusIds,
      productIds: query.productIds,
      categoryIds: query.categoryIds,
      clientTags: query.clientTags,
      instagramAccounts: query.instagramAccounts,
    };
  }
}
