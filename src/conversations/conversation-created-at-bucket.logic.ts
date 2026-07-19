import type { SelectQueryBuilder } from "typeorm";
import type { Conversation } from "../database/entities/conversation.entity";

export const CONVERSATION_CREATED_AT_TIMEZONE = "Europe/Kyiv";

export type ConversationCreatedAtBucket =
  | "today"
  | "last_week"
  | "last_month"
  | "long_ago";

export const CONVERSATION_CREATED_AT_BUCKETS: ConversationCreatedAtBucket[] = [
  "today",
  "last_week",
  "last_month",
  "long_ago",
];

export const CONVERSATION_CREATED_AT_BUCKET_LABELS: Record<
  ConversationCreatedAtBucket,
  string
> = {
  today: "Сьогодні",
  last_week: "Останній тиждень",
  last_month: "Останній місяць",
  long_ago: "Давно",
};

export type ConversationCreatedAtBucketBounds = {
  /** Inclusive lower bound (UTC), null = unbounded. */
  from: Date | null;
  /** Exclusive upper bound (UTC). */
  to: Date | null;
};

type Ymd = { year: number; month: number; day: number };

function readZonedYmd(date: Date, timeZone: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((entry) => entry.type === type)?.value;
    return Number(part);
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

function addCalendarDays(ymd: Ymd, days: number): Ymd {
  const utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/**
 * UTC instant of local midnight for `ymd` in `timeZone`.
 * Iterates a few times to absorb DST offset changes.
 */
export function zonedMidnightUtc(ymd: Ymd, timeZone: string): Date {
  let guess = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const asLocal = readZonedYmd(guess, timeZone);
    const desiredUtcDay = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
    const actualUtcDay = Date.UTC(asLocal.year, asLocal.month - 1, asLocal.day);
    const dayDeltaMs = desiredUtcDay - actualUtcDay;
    if (dayDeltaMs === 0) {
      const hourParts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(guess);
      const hour = Number(
        hourParts.find((part) => part.type === "hour")?.value ?? "0",
      );
      const minute = Number(
        hourParts.find((part) => part.type === "minute")?.value ?? "0",
      );
      const second = Number(
        hourParts.find((part) => part.type === "second")?.value ?? "0",
      );
      const localMs = ((hour * 60 + minute) * 60 + second) * 1000;
      if (localMs === 0) {
        return guess;
      }
      guess = new Date(guess.getTime() - localMs);
      continue;
    }
    guess = new Date(guess.getTime() + dayDeltaMs);
  }
  return guess;
}

export function resolveConversationCreatedAtBucketBounds(
  now: Date = new Date(),
  timeZone: string = CONVERSATION_CREATED_AT_TIMEZONE,
): Record<ConversationCreatedAtBucket, ConversationCreatedAtBucketBounds> {
  const todayYmd = readZonedYmd(now, timeZone);
  const startToday = zonedMidnightUtc(todayYmd, timeZone);
  const startTomorrow = zonedMidnightUtc(addCalendarDays(todayYmd, 1), timeZone);
  const startWeekWindow = zonedMidnightUtc(
    addCalendarDays(todayYmd, -7),
    timeZone,
  );
  const startMonthWindow = zonedMidnightUtc(
    addCalendarDays(todayYmd, -30),
    timeZone,
  );

  return {
    today: { from: startToday, to: startTomorrow },
    last_week: { from: startWeekWindow, to: startToday },
    last_month: { from: startMonthWindow, to: startWeekWindow },
    long_ago: { from: null, to: startMonthWindow },
  };
}

export function resolveConversationCreatedAtBucket(
  createdAt: Date,
  now: Date = new Date(),
  timeZone: string = CONVERSATION_CREATED_AT_TIMEZONE,
): ConversationCreatedAtBucket {
  const bounds = resolveConversationCreatedAtBucketBounds(now, timeZone);
  const ts = createdAt.getTime();
  if (ts >= bounds.today.from!.getTime() && ts < bounds.today.to!.getTime()) {
    return "today";
  }
  if (
    ts >= bounds.last_week.from!.getTime() &&
    ts < bounds.last_week.to!.getTime()
  ) {
    return "last_week";
  }
  if (
    ts >= bounds.last_month.from!.getTime() &&
    ts < bounds.last_month.to!.getTime()
  ) {
    return "last_month";
  }
  return "long_ago";
}

export function isConversationCreatedAtBucket(
  value: string,
): value is ConversationCreatedAtBucket {
  return (CONVERSATION_CREATED_AT_BUCKETS as string[]).includes(value);
}

export function applyCreatedAtBucketToQuery(
  qb: SelectQueryBuilder<Conversation>,
  bucket: ConversationCreatedAtBucket,
  now: Date = new Date(),
  timeZone: string = CONVERSATION_CREATED_AT_TIMEZONE,
): void {
  const bounds = resolveConversationCreatedAtBucketBounds(now, timeZone)[bucket];
  if (bounds.from != null) {
    qb.andWhere("c.created_at >= :createdAtBucketFrom", {
      createdAtBucketFrom: bounds.from,
    });
  }
  if (bounds.to != null) {
    qb.andWhere("c.created_at < :createdAtBucketTo", {
      createdAtBucketTo: bounds.to,
    });
  }
}
