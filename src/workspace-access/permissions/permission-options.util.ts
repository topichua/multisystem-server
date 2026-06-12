import {
  PERMISSION_OPTION_DEFINITIONS,
  PERMISSION_OPTION_KEYS,
  type PermissionOptionKey,
} from "./permission-option-keys";

export function isPermissionOptionKey(
  value: string,
): value is PermissionOptionKey {
  return (PERMISSION_OPTION_KEYS as readonly string[]).includes(value);
}

export function isPermissionOptionValue(
  key: PermissionOptionKey,
  value: string,
): boolean {
  return (
    PERMISSION_OPTION_DEFINITIONS[key].values as readonly string[]
  ).includes(value);
}

export function getPermissionOptionValue(
  permissionOptions: Record<string, string> | null | undefined,
  key: PermissionOptionKey,
): string {
  const def = PERMISSION_OPTION_DEFINITIONS[key];
  const raw = permissionOptions?.[key];
  if (raw != null && isPermissionOptionValue(key, raw)) {
    return raw;
  }
  return def.default;
}

export function normalizePermissionOptions(
  raw: Record<string, string> | null | undefined,
): Record<PermissionOptionKey, string> {
  const out = {} as Record<PermissionOptionKey, string>;
  for (const key of PERMISSION_OPTION_KEYS) {
    out[key] = getPermissionOptionValue(raw, key);
  }
  return out;
}
