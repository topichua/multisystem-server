/**
 * All valid permission keys. Stored on `workspace_roles.permissions` (jsonb).
 * Add new keys here when you introduce features; validate on role create/update.
 */
export const PERMISSION_KEYS = [
  "workspace.settings.read",
  "workspace.settings.write",
  "workspace.members.read",
  "workspace.members.invite",
  "workspace.members.manage",
  "workspace.roles.read",
  "workspace.roles.manage",
  "conversations.read",
  "conversations.write",
  "products.read",
  "products.write",
  "orders.read",
  "orders.write",
  "clients.read",
  "clients.write",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
