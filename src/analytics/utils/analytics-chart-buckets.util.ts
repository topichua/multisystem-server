import { AnalyticsPeriod } from "../types/analytics-period.enum";
import type { AnalyticsDateRange } from "../types/analytics-date-range.types";
import type { AnalyticsFilterContext } from "../types/analytics-filter-context";

export type AnalyticsChartBucketStrategy = "day" | "week" | "month";

export type AnalyticsChartBucket = {
  label: string;
  from: Date;
  to: Date;
};

const UK_MONTH_LABELS = [
  "Січ",
  "Лют",
  "Бер",
  "Кві",
  "Тра",
  "Чер",
  "Лип",
  "Сер",
  "Вер",
  "Жов",
  "Лис",
  "Гру",
] as const;

export function resolveChartBucketStrategy(
  context: AnalyticsFilterContext,
  inclusiveDayCount: (from: Date, to: Date) => number,
): AnalyticsChartBucketStrategy {
  const period = context.ranges.period;
  if (period === AnalyticsPeriod.d7) {
    return "day";
  }
  if (period === AnalyticsPeriod.d30) {
    return "week";
  }
  if (period === AnalyticsPeriod.quarter || period === AnalyticsPeriod.year) {
    return "month";
  }

  const days = inclusiveDayCount(
    context.ranges.current.from,
    context.ranges.current.to,
  );
  if (days <= 14) {
    return "day";
  }
  if (days <= 90) {
    return "week";
  }
  return "month";
}

export function buildChartBuckets(
  range: AnalyticsDateRange,
  strategy: AnalyticsChartBucketStrategy,
  helpers: {
    startOfDay: (value: Date) => Date;
    endOfDay: (value: Date) => Date;
    addDays: (value: Date, days: number) => Date;
    addMonths: (value: Date, months: number) => Date;
    inclusiveDayCount: (from: Date, to: Date) => number;
  },
): AnalyticsChartBucket[] {
  switch (strategy) {
    case "day":
      return buildDailyBuckets(range, helpers);
    case "week":
      return buildWeeklyBuckets(range, helpers);
    case "month":
      return buildMonthlyBuckets(range, helpers);
    default:
      return buildDailyBuckets(range, helpers);
  }
}

function buildDailyBuckets(
  range: AnalyticsDateRange,
  helpers: {
    startOfDay: (value: Date) => Date;
    endOfDay: (value: Date) => Date;
    addDays: (value: Date, days: number) => Date;
  },
): AnalyticsChartBucket[] {
  const buckets: AnalyticsChartBucket[] = [];
  let cursor = helpers.startOfDay(range.from);
  const end = helpers.endOfDay(range.to);

  while (cursor.getTime() <= end.getTime()) {
    const bucketEnd = helpers.endOfDay(cursor);
    buckets.push({
      label: formatDayLabel(cursor),
      from: cursor,
      to: bucketEnd.getTime() > end.getTime() ? end : bucketEnd,
    });
    cursor = helpers.startOfDay(helpers.addDays(cursor, 1));
  }

  return buckets;
}

function buildWeeklyBuckets(
  range: AnalyticsDateRange,
  helpers: {
    startOfDay: (value: Date) => Date;
    endOfDay: (value: Date) => Date;
    addDays: (value: Date, days: number) => Date;
  },
): AnalyticsChartBucket[] {
  const buckets: AnalyticsChartBucket[] = [];
  let cursor = helpers.startOfDay(range.from);
  const end = helpers.endOfDay(range.to);
  let weekIndex = 1;

  while (cursor.getTime() <= end.getTime()) {
    const bucketStart = cursor;
    const bucketEndCandidate = helpers.endOfDay(helpers.addDays(cursor, 6));
    const bucketEnd =
      bucketEndCandidate.getTime() > end.getTime() ? end : bucketEndCandidate;

    buckets.push({
      label: `${weekIndex} тиж`,
      from: bucketStart,
      to: bucketEnd,
    });

    weekIndex += 1;
    cursor = helpers.startOfDay(helpers.addDays(bucketEnd, 1));
  }

  return buckets;
}

function buildMonthlyBuckets(
  range: AnalyticsDateRange,
  helpers: {
    startOfDay: (value: Date) => Date;
    endOfDay: (value: Date) => Date;
    addMonths: (value: Date, months: number) => Date;
  },
): AnalyticsChartBucket[] {
  const buckets: AnalyticsChartBucket[] = [];
  let cursor = helpers.startOfDay(
    new Date(range.from.getFullYear(), range.from.getMonth(), 1),
  );
  const end = helpers.endOfDay(range.to);

  while (cursor.getTime() <= end.getTime()) {
    const monthStart =
      cursor.getTime() < range.from.getTime()
        ? helpers.startOfDay(range.from)
        : helpers.startOfDay(cursor);
    const monthEndCandidate = helpers.endOfDay(
      new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0),
    );
    const monthEnd =
      monthEndCandidate.getTime() > end.getTime() ? end : monthEndCandidate;

    buckets.push({
      label: UK_MONTH_LABELS[cursor.getMonth()] ?? formatDayLabel(cursor),
      from: monthStart,
      to: monthEnd,
    });

    cursor = helpers.startOfDay(
      new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
    );
  }

  return buckets;
}

function formatDayLabel(value: Date): string {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}
