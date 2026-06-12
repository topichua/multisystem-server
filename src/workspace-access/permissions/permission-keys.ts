/**
 * Boolean permission keys. Stored in `workspace_roles.permissions` (jsonb array).
 * Per-integration conversation permissions live on `workspace_role_integration_grants`.
 */
export const PERMISSION_KEYS = [
  "products.read",
  "products.write",
  "products.custom_fields",
  "products.category",
  "products.ai_import",
  "orders.read",
  "orders.create",
  "orders.edit_status",
  "orders.edit",
  "conversations.full_access",
  "clients.read",
  "workspace.chat_groups",
  "workspace.templates",
  "workspace.integrations",
  "workspace.roles",
  "workspace.members.read",
  "workspace.members.invite",
  "workspace.members.delete",
  "analytics.read",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
