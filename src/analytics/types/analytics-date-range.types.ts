import type { AnalyticsPeriod } from "./analytics-period.enum";

export type AnalyticsDateRange = {
  from: Date;
  to: Date;
};

export type AnalyticsPeriodRanges = {
  current: AnalyticsDateRange;
  previous: AnalyticsDateRange;
  period?: AnalyticsPeriod;
};
