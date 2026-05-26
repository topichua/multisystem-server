import { BadRequestException } from "@nestjs/common";
import { PERMISSION_KEYS } from "./permission-keys";
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
