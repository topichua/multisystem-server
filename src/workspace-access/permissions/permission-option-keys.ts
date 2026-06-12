/** Option permission keys. Stored in `workspace_roles.permission_options`. */
export const PERMISSION_OPTION_KEYS = ["orders.visibility"] as const;

export type PermissionOptionKey = (typeof PERMISSION_OPTION_KEYS)[number];

/** Keys whose selected values are stored in `permission_option_lists`. */
export const PERMISSION_OPTION_LIST_KEYS = [] as const;

export type PermissionOptionListKey =
  (typeof PERMISSION_OPTION_LIST_KEYS)[number];

export const PERMISSION_OPTION_DEFINITIONS = {
  "orders.visibility": {
    values: ["all", "mine"] as const,
    default: "mine" as const,
  },
} as const satisfies Record<
  PermissionOptionKey,
  {
    values: readonly string[];
    default: string;
  }
>;

export type PermissionOptionValueFor<K extends PermissionOptionKey> =
  (typeof PERMISSION_OPTION_DEFINITIONS)[K]["values"][number];
