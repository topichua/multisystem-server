import type { AnalyticsFilterContext } from "../types/analytics-filter-context";
import type { AnalyticsDateRange } from "../types/analytics-date-range.types";

export interface AnalyticsMetricCalculator<TResult> {
  calculate(context: AnalyticsFilterContext): Promise<TResult>;
}

export interface AnalyticsRangeMetricCalculator {
  calculateForRange(
    context: AnalyticsFilterContext,
    range: AnalyticsDateRange,
  ): Promise<number>;
}
