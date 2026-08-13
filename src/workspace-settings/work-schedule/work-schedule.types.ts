export const WORK_WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type WorkWeekdayKey = (typeof WORK_WEEKDAY_KEYS)[number];

export type WorkDayHours = {
  start: string;
  end: string;
};

export type WorkspaceWorkSchedule = {
  /** Default start time `HH:mm` (local to timezone). */
  dayStart: string;
  /** Default end time `HH:mm` (local to timezone). */
  dayEnd: string;
  /** Selected working weekdays. Unselected = days off. */
  workDays: WorkWeekdayKey[];
  /** When true, use `dayHours` per selected day. */
  differentHoursPerDay: boolean;
  /** Per-day overrides; only meaningful when `differentHoursPerDay` is true. */
  dayHours: Partial<Record<WorkWeekdayKey, WorkDayHours>>;
};

export const DEFAULT_WORKSPACE_TIMEZONE = "Europe/Kyiv";

export const DEFAULT_WORK_SCHEDULE: WorkspaceWorkSchedule = {
  dayStart: "09:00",
  dayEnd: "19:00",
  workDays: ["mon", "tue", "wed", "thu", "fri"],
  differentHoursPerDay: false,
  dayHours: {},
};
