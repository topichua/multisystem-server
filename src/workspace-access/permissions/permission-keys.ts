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
  "products.inventory.view",
  "products.inventory.manage",
  "orders.read",
  "orders.create",
  "orders.edit_status",
  "orders.edit",
  "orders.automations.view",
  "orders.automations.manage",
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
  "payments.integrations.view",
  "payments.integrations.manage",
  "payments.links.create",
  "payments.links.cancel",
  "payments.view",
  "payments.manual.create",
  "payments.manual_methods.view",
  "payments.manual_methods.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
