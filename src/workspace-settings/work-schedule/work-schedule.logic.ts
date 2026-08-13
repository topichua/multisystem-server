import { BadRequestException } from "@nestjs/common";
import {
  DEFAULT_WORK_SCHEDULE,
  DEFAULT_WORKSPACE_TIMEZONE,
  WORK_WEEKDAY_KEYS,
  type WorkDayHours,
  type WorkWeekdayKey,
  type WorkspaceWorkSchedule,
} from "./work-schedule.types";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isWorkWeekdayKey(value: string): value is WorkWeekdayKey {
  return (WORK_WEEKDAY_KEYS as readonly string[]).includes(value);
}

export function parseHhMm(value: string): { hours: number; minutes: number } {
  const match = TIME_RE.exec(value.trim());
  if (!match) {
    throw new BadRequestException(
      `Invalid time "${value}". Expected HH:mm (00:00–23:59)`,
    );
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function timeToMinutes(value: string): number {
  const { hours, minutes } = parseHhMm(value);
  return hours * 60 + minutes;
}

export function normalizeWorkSchedule(
  raw: Partial<WorkspaceWorkSchedule> | null | undefined,
): WorkspaceWorkSchedule {
  const base = DEFAULT_WORK_SCHEDULE;
  if (raw == null || typeof raw !== "object") {
    return { ...base, workDays: [...base.workDays], dayHours: {} };
  }

  const dayStart = String(raw.dayStart ?? base.dayStart).trim();
  const dayEnd = String(raw.dayEnd ?? base.dayEnd).trim();
  parseHhMm(dayStart);
  parseHhMm(dayEnd);
  if (timeToMinutes(dayStart) >= timeToMinutes(dayEnd)) {
    throw new BadRequestException("dayStart must be before dayEnd");
  }

  const workDaysRaw = Array.isArray(raw.workDays) ? raw.workDays : base.workDays;
  const workDays: WorkWeekdayKey[] = [];
  const seen = new Set<string>();
  for (const day of workDaysRaw) {
    const key = String(day).trim().toLowerCase();
    if (!isWorkWeekdayKey(key)) {
      throw new BadRequestException(
        `Invalid work day "${day}". Allowed: ${WORK_WEEKDAY_KEYS.join(", ")}`,
      );
    }
    if (!seen.has(key)) {
      seen.add(key);
      workDays.push(key);
    }
  }
  workDays.sort(
    (a, b) => WORK_WEEKDAY_KEYS.indexOf(a) - WORK_WEEKDAY_KEYS.indexOf(b),
  );

  const differentHoursPerDay = Boolean(
    raw.differentHoursPerDay ?? base.differentHoursPerDay,
  );

  const dayHours: Partial<Record<WorkWeekdayKey, WorkDayHours>> = {};
  if (differentHoursPerDay) {
    const source =
      raw.dayHours && typeof raw.dayHours === "object" ? raw.dayHours : {};
    for (const day of workDays) {
      const override = (source as Record<string, WorkDayHours | undefined>)[day];
      const start = String(override?.start ?? dayStart).trim();
      const end = String(override?.end ?? dayEnd).trim();
      parseHhMm(start);
      parseHhMm(end);
      if (timeToMinutes(start) >= timeToMinutes(end)) {
        throw new BadRequestException(
          `dayHours.${day}: start must be before end`,
        );
      }
      dayHours[day] = { start, end };
    }
  }

  return {
    dayStart,
    dayEnd,
    workDays,
    differentHoursPerDay,
    dayHours,
  };
}

export function resolveDayHours(
  schedule: WorkspaceWorkSchedule,
  day: WorkWeekdayKey,
): WorkDayHours | null {
  if (!schedule.workDays.includes(day)) {
    return null;
  }
  if (schedule.differentHoursPerDay && schedule.dayHours[day]) {
    return schedule.dayHours[day]!;
  }
  return { start: schedule.dayStart, end: schedule.dayEnd };
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: WorkWeekdayKey;
};

const WEEKDAY_FROM_SHORT: Record<string, WorkWeekdayKey> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  const weekdayShort = (map.weekday ?? "").toLowerCase().slice(0, 3);
  const weekday = WEEKDAY_FROM_SHORT[weekdayShort];
  if (!weekday) {
    throw new BadRequestException(`Unable to resolve weekday in ${timeZone}`);
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday,
  };
}

/** Build a UTC Date for local Y-M-D HH:mm:ss in `timeZone`. */
export function zonedLocalToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );
  // Iteratively correct for timezone offset.
  let instant = new Date(utcGuess);
  for (let i = 0; i < 3; i += 1) {
    const zoned = getZonedParts(instant, timeZone);
    const asUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const desired = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0,
    );
    instant = new Date(instant.getTime() + (desired - asUtc));
  }
  return instant;
}

export function isWithinWorkSchedule(
  at: Date,
  schedule: WorkspaceWorkSchedule,
  timeZone: string = DEFAULT_WORKSPACE_TIMEZONE,
): boolean {
  const zoned = getZonedParts(at, timeZone);
  const hours = resolveDayHours(schedule, zoned.weekday);
  if (!hours) {
    return false;
  }
  const nowMinutes = zoned.hour * 60 + zoned.minute;
  const start = timeToMinutes(hours.start);
  const end = timeToMinutes(hours.end);
  return nowMinutes >= start && nowMinutes < end;
}

/**
 * If `at` is inside working hours → `at`.
 * Otherwise → start of the next working window in the workspace timezone.
 */
export function resolveNextWorkScheduleSlot(
  at: Date,
  schedule: WorkspaceWorkSchedule,
  timeZone: string = DEFAULT_WORKSPACE_TIMEZONE,
): Date {
  if (schedule.workDays.length === 0) {
    return at;
  }
  if (isWithinWorkSchedule(at, schedule, timeZone)) {
    return at;
  }

  const zoned = getZonedParts(at, timeZone);
  const nowMinutes = zoned.hour * 60 + zoned.minute;

  for (let offset = 0; offset < 8; offset += 1) {
    const candidateDate = addCalendarDays(zoned, offset);
    const hours = resolveDayHours(schedule, candidateDate.weekday);
    if (!hours) {
      continue;
    }
    const start = timeToMinutes(hours.start);
    if (offset === 0 && nowMinutes >= start) {
      // Same day but after/at end — skip to next day.
      continue;
    }
    if (offset === 0 && nowMinutes < start) {
      return zonedLocalToUtc(
        {
          year: candidateDate.year,
          month: candidateDate.month,
          day: candidateDate.day,
          hour: Math.floor(start / 60),
          minute: start % 60,
          second: 0,
        },
        timeZone,
      );
    }
    if (offset > 0) {
      return zonedLocalToUtc(
        {
          year: candidateDate.year,
          month: candidateDate.month,
          day: candidateDate.day,
          hour: Math.floor(start / 60),
          minute: start % 60,
          second: 0,
        },
        timeZone,
      );
    }
  }

  return at;
}

function addCalendarDays(
  base: ZonedParts,
  days: number,
): { year: number; month: number; day: number; weekday: WorkWeekdayKey } {
  // Use UTC noon anchor to avoid DST edge issues when adding days.
  const utc = Date.UTC(base.year, base.month - 1, base.day + days, 12, 0, 0);
  const date = new Date(utc);
  const weekday =
    WORK_WEEKDAY_KEYS[(date.getUTCDay() + 6) % 7]!; // JS Sun=0 → mon-first
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday,
  };
}

export function normalizeTimezone(raw: string | null | undefined): string {
  const value = (raw ?? DEFAULT_WORKSPACE_TIMEZONE).trim() || DEFAULT_WORKSPACE_TIMEZONE;
  try {
    // Throws RangeError for invalid IANA zones in modern Node.
    Intl.DateTimeFormat(undefined, { timeZone: value });
  } catch {
    throw new BadRequestException(`Invalid timezone "${value}"`);
  }
  return value;
}
