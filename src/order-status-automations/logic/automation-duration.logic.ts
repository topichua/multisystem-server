import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";

export function addDuration(
  from: Date,
  value: number,
  unit: AutomationDurationUnit,
): Date {
  const result = new Date(from.getTime());
  switch (unit) {
    case AutomationDurationUnit.minutes:
      result.setMinutes(result.getMinutes() + value);
      break;
    case AutomationDurationUnit.hours:
      result.setHours(result.getHours() + value);
      break;
    case AutomationDurationUnit.days:
      result.setDate(result.getDate() + value);
      break;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
  return result;
}

export function formatAutomationDuration(
  value: number | null,
  unit: AutomationDurationUnit | null,
): string | null {
  if (value == null || unit == null) {
    return null;
  }
  const unitLabel =
    unit === AutomationDurationUnit.minutes
      ? "хв"
      : unit === AutomationDurationUnit.hours
        ? "год"
        : "дн";
  return `${value} ${unitLabel}`;
}

export function buildIdempotencyKey(input: {
  sourceType: string;
  sourceStatus: string;
  statusChangedAt: Date | null;
  timed: boolean;
}): string {
  const at = input.statusChangedAt?.toISOString() ?? "immediate";
  return `${input.sourceType}:${input.sourceStatus}:${input.timed ? "timed" : "immediate"}:${at}`;
}
