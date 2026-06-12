import { BadRequestException } from "@nestjs/common";
import { PERMISSION_KEYS } from "./permission-keys";
import { normalizePermissionOptionLists } from "./permission-option-lists.util";
import { PERMISSION_OPTION_LIST_KEYS } from "./permission-option-keys";
import {
  isPermissionOptionKey,
  isPermissionOptionValue,
  normalizePermissionOptions,
} from "./permission-options.util";
import { isPermissionKey } from "./permissions-catalog";

export function validatePermissionKeys(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException(
      "permissions must be a non-empty array of permission keys",
    );
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new BadRequestException("each permission must be a string");
    }
    const key = item.trim();
    if (!key) {
      continue;
    }
    if (!isPermissionKey(key)) {
      throw new BadRequestException(
        `Unknown permission "${key}". Allowed keys: ${PERMISSION_KEYS.join(", ")}`,
      );
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(key);
  }
  if (out.length === 0) {
    throw new BadRequestException(
      "permissions must include at least one valid permission key",
    );
  }
  return out;
}

export function validatePermissionOptions(
  raw: unknown,
): Record<string, string> {
  if (raw == null) {
    return normalizePermissionOptions(undefined);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException(
      "permissionOptions must be an object keyed by option permission id",
    );
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      continue;
    }
    if (!isPermissionOptionKey(trimmedKey)) {
      throw new BadRequestException(
        `Unknown option permission "${trimmedKey}"`,
      );
    }
    if (typeof value !== "string") {
      throw new BadRequestException(
        `permissionOptions.${trimmedKey} must be a string`,
      );
    }
    const trimmedValue = value.trim();
    if (!isPermissionOptionValue(trimmedKey, trimmedValue)) {
      throw new BadRequestException(
        `Invalid value "${trimmedValue}" for permissionOptions.${trimmedKey}`,
      );
    }
    out[trimmedKey] = trimmedValue;
  }

  return normalizePermissionOptions(out);
}

export function validatePermissionOptionLists(
  options: Record<string, string>,
  raw: unknown,
): Record<string, string[]> {
  if (raw == null) {
    return normalizePermissionOptionLists(options, undefined);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException(
      "permissionOptionLists must be an object keyed by option permission id",
    );
  }

  if ((PERMISSION_OPTION_LIST_KEYS as readonly string[]).length === 0) {
    if (Object.keys(raw as object).length > 0) {
      throw new BadRequestException(
        "permissionOptionLists is not used; configure integration grants via PUT /workspace/roles/:roleId/integration-grants",
      );
    }
    return {};
  }
  return normalizePermissionOptionLists(options, raw as Record<string, string[]>);
}
