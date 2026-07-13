import { BadRequestException } from "@nestjs/common";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";
import {
  isValidAutomationSourceStatus,
  normalizeAutomationSourceStatus,
} from "./automation-source-status.logic";

export type AutomationConditionInput = {
  sourceType: AutomationSourceType;
  sourceStatus: string;
};

export type NormalizedAutomationCondition = {
  sourceType: AutomationSourceType;
  sourceStatus: string;
};

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
    const key = `${condition.sourceType}:${sourceStatus}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      sourceType: condition.sourceType,
      sourceStatus,
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
      const left = `${a.sourceType}:${a.sourceStatus}`;
      const right = `${b.sourceType}:${b.sourceStatus}`;
      return left.localeCompare(right);
    })
    .map((condition) => `${condition.sourceType}:${condition.sourceStatus}`)
    .join("|");
}
