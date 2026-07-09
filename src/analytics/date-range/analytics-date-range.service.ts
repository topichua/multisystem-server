import { BadRequestException, Injectable } from "@nestjs/common";
import { AnalyticsPeriod } from "../types/analytics-period.enum";
import type {
  AnalyticsDateRange,
  AnalyticsPeriodRanges,
} from "../types/analytics-date-range.types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsDateRangeService {
  resolveRanges(params: {
    period?: AnalyticsPeriod;
    dateFrom?: string;
    dateTo?: string;
    now?: Date;
  }): AnalyticsPeriodRanges {
    const now = params.now ?? new Date();
    const customFrom = this.parseDateBoundary(params.dateFrom, "start");
    const customTo = this.parseDateBoundary(params.dateTo, "end");

    if (customFrom || customTo) {
      if (!customFrom || !customTo) {
        throw new BadRequestException(
          "Both dateFrom and dateTo are required for a custom analytics range",
        );
      }
      if (customFrom.getTime() > customTo.getTime()) {
        throw new BadRequestException("dateFrom must be before or equal to dateTo");
      }

      const current = { from: customFrom, to: customTo };
      return {
        current,
        previous: this.buildPreviousRange(current),
      };
    }

    const period = params.period ?? AnalyticsPeriod.d30;
    const current = this.buildPeriodRange(period, now);
    return {
      current,
      previous: this.buildPreviousRange(current),
      period,
    };
  }

  private buildPeriodRange(period: AnalyticsPeriod, now: Date): AnalyticsDateRange {
    const end = this.endOfDay(now);

    switch (period) {
      case AnalyticsPeriod.d7:
        return {
          from: this.startOfDay(this.addDays(end, -6)),
          to: end,
        };
      case AnalyticsPeriod.d30:
        return {
          from: this.startOfDay(this.addDays(end, -29)),
          to: end,
        };
      case AnalyticsPeriod.quarter:
        return {
          from: this.startOfDay(this.addMonths(end, -2)),
          to: end,
        };
      case AnalyticsPeriod.year:
        return {
          from: this.startOfDay(this.addMonths(end, -11)),
          to: end,
        };
      default:
        throw new BadRequestException(`Unsupported analytics period: ${period}`);
    }
  }

  private buildPreviousRange(current: AnalyticsDateRange): AnalyticsDateRange {
    const inclusiveDays = this.inclusiveDayCount(current.from, current.to);
    const previousEnd = this.endOfDay(this.addDays(current.from, -1));
    const previousStart = this.startOfDay(
      this.addDays(previousEnd, -(inclusiveDays - 1)),
    );
    return {
      from: previousStart,
      to: previousEnd,
    };
  }

  inclusiveDayCount(from: Date, to: Date): number {
    const start = this.startOfDay(from).getTime();
    const end = this.startOfDay(to).getTime();
    return Math.floor((end - start) / MS_PER_DAY) + 1;
  }

  startOfDay(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  endOfDay(value: Date): Date {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  addDays(value: Date, days: number): Date {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date;
  }

  addMonths(value: Date, months: number): Date {
    const date = new Date(value);
    date.setMonth(date.getMonth() + months);
    return date;
  }

  toIsoString(value: Date): string {
    return value.toISOString();
  }

  private parseDateBoundary(
    raw: string | undefined,
    boundary: "start" | "end",
  ): Date | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid analytics date: ${raw}`);
    }
    return boundary === "start"
      ? this.startOfDay(parsed)
      : this.endOfDay(parsed);
  }
}
