import { Injectable } from "@nestjs/common";
import { AnalyticsDateRangeService } from "../../date-range/analytics-date-range.service";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsRevenueChartResult } from "../../types/analytics-chart.types";
import type { AnalyticsMetricCalculator } from "../analytics-metric-calculator.interface";
import { RevenueKpiCalculator } from "../kpi/revenue-kpi.calculator";
import {
  buildChartBuckets,
  resolveChartBucketStrategy,
} from "../../utils/analytics-chart-buckets.util";

@Injectable()
export class RevenueChartCalculator implements AnalyticsMetricCalculator<AnalyticsRevenueChartResult> {
  constructor(
    private readonly revenueCalculator: RevenueKpiCalculator,
    private readonly dateRangeService: AnalyticsDateRangeService,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsRevenueChartResult> {
    const strategy = resolveChartBucketStrategy(context, (from, to) =>
      this.dateRangeService.inclusiveDayCount(from, to),
    );
    const buckets = buildChartBuckets(context.ranges.current, strategy, {
      startOfDay: (value) => this.dateRangeService.startOfDay(value),
      endOfDay: (value) => this.dateRangeService.endOfDay(value),
      addDays: (value, days) => this.dateRangeService.addDays(value, days),
      addMonths: (value, months) =>
        this.dateRangeService.addMonths(value, months),
      inclusiveDayCount: (from, to) =>
        this.dateRangeService.inclusiveDayCount(from, to),
    });

    const values = await Promise.all(
      buckets.map((bucket) =>
        this.revenueCalculator.calculateForRange(context, {
          from: bucket.from,
          to: bucket.to,
        }),
      ),
    );

    return {
      points: buckets.map((bucket, index) => ({
        label: bucket.label,
        dateFrom: this.dateRangeService.toIsoString(bucket.from),
        dateTo: this.dateRangeService.toIsoString(bucket.to),
        value: values[index] ?? 0,
      })),
    };
  }
}
