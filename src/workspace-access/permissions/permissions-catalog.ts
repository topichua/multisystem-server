import { PERMISSION_KEYS, type PermissionKey } from "./permission-keys";

export type PermissionDefinition = {
  key: PermissionKey;
  description: string;
};

export type PermissionModuleDefinition = {
  module: string;
  label: string;
  permissions: PermissionDefinition[];
};

/** Static catalog for API + role validation (not stored in DB). */
export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  {
    module: "workspace",
    label: "Workspace",
    permissions: [
      {
        key: "workspace.settings.read",
        description: "View workspace settings",
      },
      {
        key: "workspace.settings.write",
        description: "Update workspace settings",
      },
      {
        key: "workspace.members.read",
        description: "List workspace members",
      },
      {
        key: "workspace.members.invite",
        description: "Invite members to the workspace",
      },
      {
        key: "workspace.members.manage",
        description: "Change roles or remove members",
      },
      {
        key: "workspace.roles.read",
        description: "List workspace roles",
      },
      {
        key: "workspace.roles.manage",
        description: "Create and edit workspace roles",
      },
    ],
  },
  {
    module: "conversations",
    label: "Conversations",
    permissions: [
      {
        key: "conversations.read",
        description: "View conversations and messages",
      },
      {
        key: "conversations.write",
        description: "Send messages and manage conversations",
      },
    ],
  },
  {
    module: "products",
    label: "Products",
    permissions: [
      { key: "products.read", description: "View products and catalog" },
      { key: "products.write", description: "Create and edit products" },
    ],
  },
  {
    module: "orders",
    label: "Orders",
    permissions: [
      { key: "orders.read", description: "View orders" },
      { key: "orders.write", description: "Create and update orders" },
    ],
  },
  {
    module: "clients",
    label: "Clients",
    permissions: [
      { key: "clients.read", description: "View clients" },
      { key: "clients.write", description: "Create and edit clients" },
    ],
  },
];

const ALL_KEYS_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return ALL_KEYS_SET.has(value);
}

export function normalizePermissionKeys(raw: string[]): PermissionKey[] {
  const out: PermissionKey[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = item.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    if (!isPermissionKey(key)) {
      throw new Error(`Unknown permission: ${key}`);
    }
    seen.add(key);
    out.push(key);
  }
  return out;
}
