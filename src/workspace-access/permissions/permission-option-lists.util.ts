import { PERMISSION_OPTION_LIST_KEYS } from "./permission-option-keys";

export function normalizePermissionOptionLists(
  _options: Record<string, string> | null | undefined,
  raw: Record<string, string[]> | null | undefined,
): Record<string, string[]> {
  if ((PERMISSION_OPTION_LIST_KEYS as readonly string[]).length === 0) {
    return {};
  }
  // Reserved for future option-list permissions.
  return { ...(raw ?? {}) };
}
