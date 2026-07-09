import type { AnalyticsPeriodRanges } from "./analytics-date-range.types";

/** Shared analytics scope passed from HTTP layer into calculators. */
export type AnalyticsFilterContext = {
  workspaceId: number;
  currency: string;
  ranges: AnalyticsPeriodRanges;
  channelIds?: number[];
  managerIds?: number[];
  orderStatusIds?: number[];
  productIds?: number[];
  categoryIds?: number[];
  clientTags?: string[];
  instagramAccounts?: string[];
};
