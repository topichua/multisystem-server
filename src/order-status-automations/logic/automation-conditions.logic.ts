import { BadRequestException } from "@nestjs/common";
import { AutomationConditionOperator } from "../../database/entities/automation-condition-operator.enum";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";
import {
  isValidAutomationSourceStatus,
  normalizeAutomationSourceStatus,
} from "./automation-source-status.logic";

export type AutomationConditionInput = {
  sourceType: AutomationSourceType;
  sourceStatus: string;
  /** EQ (default) or NEQ. Also accepts lowercase / aliases. */
  operator?: AutomationConditionOperator | string | null;
  durationValue?: number | null;
  durationUnit?: AutomationDurationUnit | null;
};

export type NormalizedAutomationCondition = {
  sourceType: AutomationSourceType;
  sourceStatus: string;
  operator: AutomationConditionOperator;
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

export function normalizeAutomationConditionOperator(
  raw: unknown,
): AutomationConditionOperator {
  if (raw == null || raw === "") {
    return AutomationConditionOperator.eq;
  }
  const value = String(raw).trim().toUpperCase();
  if (
    value === AutomationConditionOperator.eq ||
    value === "EQUALS" ||
    value === "EQUAL" ||
    value === "="
  ) {
    return AutomationConditionOperator.eq;
  }
  if (
    value === AutomationConditionOperator.neq ||
    value === "NOT_EQUALS" ||
    value === "NOT_EQUAL" ||
    value === "NE" ||
    value === "!=" ||
    value === "<>"
  ) {
    return AutomationConditionOperator.neq;
  }
  throw new BadRequestException(
    `Invalid operator "${String(raw)}". Allowed: EQ, NEQ`,
  );
}

/** True when observed status satisfies condition operator vs condition sourceStatus. */
export function matchesAutomationSourceStatus(
  operator: AutomationConditionOperator,
  conditionSourceStatus: string,
  observedSourceStatus: string | null | undefined,
): boolean {
  if (observedSourceStatus == null || observedSourceStatus === "") {
    return false;
  }
  const observed = observedSourceStatus.trim().toLowerCase();
  const expected = conditionSourceStatus.trim().toLowerCase();
  if (operator === AutomationConditionOperator.neq) {
    return observed !== expected;
  }
  return observed === expected;
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
    const sourceStatus = normalizeAutomationSourceStatus(
      condition.sourceType,
      condition.sourceStatus,
    );
    if (!isValidAutomationSourceStatus(condition.sourceType, sourceStatus)) {
      throw new BadRequestException(
        condition.sourceType === AutomationSourceType.order_status
          ? "Invalid sourceStatus for ORDER_STATUS: expected workspace order status id (numeric string)"
          : "Invalid sourceStatus for sourceType",
      );
    }
    const operator = normalizeAutomationConditionOperator(condition.operator);
    const duration = validateDurationPair(
      condition.durationValue,
      condition.durationUnit,
    );
    const key = `${condition.sourceType}:${operator}:${sourceStatus}:${duration.durationValue ?? ""}:${duration.durationUnit ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      sourceType: condition.sourceType,
      sourceStatus,
      operator,
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
      const left = conditionKey(a);
      const right = conditionKey(b);
      return left.localeCompare(right);
    })
    .map(conditionKey)
    .join("|");
}

function conditionKey(condition: NormalizedAutomationCondition): string {
  return `${condition.sourceType}:${condition.operator}:${condition.sourceStatus}:${condition.durationValue ?? ""}:${condition.durationUnit ?? ""}`;
}

export function isTimedCondition(condition: {
  durationValue: number | null;
  durationUnit: AutomationDurationUnit | null;
}): boolean {
  return condition.durationValue != null && condition.durationUnit != null;
}
