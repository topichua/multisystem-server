import { BadRequestException } from "@nestjs/common";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";
import {
  isValidAutomationSourceStatus,
  normalizeAutomationSourceStatus,
} from "./automation-source-status.logic";

export type AutomationConditionInput = {
  sourceType: AutomationSourceType;
  sourceStatus: string;
  durationValue?: number | null;
  durationUnit?: AutomationDurationUnit | null;
};

export type NormalizedAutomationCondition = {
  sourceType: AutomationSourceType;
  sourceStatus: string;
  durationValue: number | null;
  durationUnit: AutomationDurationUnit | null;
};

function validateDurationPair(
  durationValue: number | null | undefined,
  durationUnit: AutomationDurationUnit | null | undefined,
): { durationValue: number | null; durationUnit: AutomationDurationUnit | null } {
  const hasValue = durationValue != null;
  const hasUnit = durationUnit != null;
  if (hasValue !== hasUnit) {
    throw new BadRequestException(
      "durationValue and durationUnit must be provided together or both omitted",
    );
  }
  if (durationValue != null && durationValue <= 0) {
    throw new BadRequestException("durationValue must be greater than zero");
  }
  return {
    durationValue: durationValue ?? null,
    durationUnit: durationUnit ?? null,
  };
}

export function normalizeAutomationConditions(
  conditions: AutomationConditionInput[],
): NormalizedAutomationCondition[] {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new BadRequestException(
      "At least one trigger condition is required",
    );
  }

  const seen = new Set<string>();
  const normalized: NormalizedAutomationCondition[] = [];

  for (const condition of conditions) {
    const sourceStatus = normalizeAutomationSourceStatus(condition.sourceStatus);
    if (!isValidAutomationSourceStatus(condition.sourceType, sourceStatus)) {
      throw new BadRequestException("Invalid sourceStatus for sourceType");
    }
    const duration = validateDurationPair(
      condition.durationValue,
      condition.durationUnit,
    );
    const key = `${condition.sourceType}:${sourceStatus}:${duration.durationValue ?? ""}:${duration.durationUnit ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      sourceType: condition.sourceType,
      sourceStatus,
      durationValue: duration.durationValue,
      durationUnit: duration.durationUnit,
    });
  }

  if (normalized.length === 0) {
    throw new BadRequestException(
      "At least one unique trigger condition is required",
    );
  }

  return normalized;
}

export function buildConditionSignature(
  conditions: NormalizedAutomationCondition[],
): string {
  return [...conditions]
    .sort((a, b) => {
      const left = `${a.sourceType}:${a.sourceStatus}:${a.durationValue ?? ""}:${a.durationUnit ?? ""}`;
      const right = `${b.sourceType}:${b.sourceStatus}:${b.durationValue ?? ""}:${b.durationUnit ?? ""}`;
      return left.localeCompare(right);
    })
    .map(
      (condition) =>
        `${condition.sourceType}:${condition.sourceStatus}:${condition.durationValue ?? ""}:${condition.durationUnit ?? ""}`,
    )
    .join("|");
}

export function isTimedCondition(condition: {
  durationValue: number | null;
  durationUnit: AutomationDurationUnit | null;
}): boolean {
  return condition.durationValue != null && condition.durationUnit != null;
}
