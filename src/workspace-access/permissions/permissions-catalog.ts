import { INTEGRATION_GRANT_PERMISSION_CATALOG } from "./integration-grant-permissions";
import { PERMISSION_KEYS, type PermissionKey } from "./permission-keys";
import {
  PERMISSION_OPTION_DEFINITIONS,
  type PermissionOptionKey,
} from "./permission-option-keys";

export type PermissionCatalogStorage = "permissions" | "permissionOptions";

export type PermissionCatalogBooleanItem = {
  type: "boolean";
  key: PermissionKey;
  description: string;
  storage: "permissions";
  default: false;
};

export type PermissionCatalogOptionValue = {
  value: string;
  label: string;
};

export type PermissionCatalogOptionItem = {
  type: "option";
  key: PermissionOptionKey;
  description: string;
  storage: "permissionOptions";
  options: PermissionCatalogOptionValue[];
  default: string;
  selectedValue?: string;
  selectedOptions?: PermissionCatalogOptionValue[];
};

export type PermissionCatalogGroupItem = {
  type: "group";
  key: string;
  label: string;
  scope: PermissionCatalogOptionItem;
  items: PermissionCatalogNode[];
};

export type PermissionCatalogIntegrationGrantField = {
  key: string;
  type: "boolean" | "option";
  description: string;
  storage: "integrationGrants";
  default: string | boolean;
  options?: PermissionCatalogOptionValue[];
  integrationTypes?: readonly string[];
};

export type PermissionCatalogIntegrationGrantsItem = {
  type: "integration_grants";
  key: "integration_grants";
  label: string;
  description: string;
  storage: "integrationGrants";
  manageEndpoint: "/workspace/roles/:roleId/integration-grants";
  items: PermissionCatalogIntegrationGrantField[];
};

export type PermissionCatalogNode =
  | PermissionCatalogBooleanItem
  | PermissionCatalogOptionItem
  | PermissionCatalogGroupItem
  | PermissionCatalogIntegrationGrantsItem;

export type PermissionModuleDefinition = {
  module: string;
  label: string;
  items: PermissionCatalogNode[];
};

function optionPermission(
  key: PermissionOptionKey,
  description: string,
  labels: Record<string, string>,
  selectedLabels?: Record<string, string>,
): PermissionCatalogOptionItem {
  const def = PERMISSION_OPTION_DEFINITIONS[key];
  return {
    type: "option",
    key,
    description,
    storage: "permissionOptions",
    default: def.default,
    options: def.values.map((value) => ({
      value,
      label: labels[value] ?? value,
    })),
  };
}

function booleanPermission(
  key: PermissionKey,
  description: string,
): PermissionCatalogBooleanItem {
  return {
    type: "boolean",
    key,
    description,
    storage: "permissions",
    default: false,
  };
}

function integrationGrantsSchema(): PermissionCatalogIntegrationGrantsItem {
  return {
    type: "integration_grants",
    key: "integration_grants",
    label: "By integration",
    description:
      "Grant access per Instagram/Telegram integration with conversation permissions. " +
      "New integrations are denied until granted.",
    storage: "integrationGrants",
    manageEndpoint: "/workspace/roles/:roleId/integration-grants",
    items: INTEGRATION_GRANT_PERMISSION_CATALOG.map((field) => ({
      key: field.key,
      type: field.type,
      description: field.description,
      storage: "integrationGrants" as const,
      default: field.default,
      ...("options" in field ? { options: [...field.options] } : {}),
      ...("integrationTypes" in field
        ? { integrationTypes: [...field.integrationTypes] }
        : {}),
    })),
  };
}

/** Static catalog for API + role validation (not stored in DB). */
export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  {
    module: "products",
    label: "Product",
    items: [
      booleanPermission("products.read", "View products"),
      booleanPermission("products.write", "Create and edit products"),
      booleanPermission("products.custom_fields", "Custom fields management"),
      booleanPermission("products.category", "Category management"),
      booleanPermission("products.ai_import", "AI product import"),
    ],
  },
  {
    module: "orders",
    label: "Order",
    items: [
      booleanPermission("orders.read", "View orders"),
      {
        type: "group",
        key: "orders.scope",
        label: "Visibility",
        scope: optionPermission("orders.visibility", "Order visibility scope", {
          all: "All",
          mine: "Mine",
        }),
        items: [
          booleanPermission("orders.create", "Create order"),
          booleanPermission("orders.edit_status", "Edit order status"),
          booleanPermission("orders.edit", "Edit order"),
        ],
      },
    ],
  },
  {
    module: "conversations",
    label: "Conversations",
    items: [
      booleanPermission(
        "conversations.full_access",
        "Full access to all integrations (read, write, Instagram comments). Ignores per-integration grants.",
      ),
      integrationGrantsSchema(),
    ],
  },
  {
    module: "clients",
    label: "Clients",
    items: [booleanPermission("clients.read", "View client list")],
  },
  {
    module: "workspace",
    label: "Workspace",
    items: [
      booleanPermission("workspace.chat_groups", "Chat groups management"),
      booleanPermission("workspace.templates", "Templates management"),
      booleanPermission("workspace.integrations", "Integrations"),
      booleanPermission("workspace.roles", "Roles management"),
      booleanPermission("workspace.members.read", "View members"),
      booleanPermission("workspace.members.invite", "Invite members"),
      booleanPermission("workspace.members.delete", "Delete members"),
    ],
  },
  {
    module: "analytics",
    label: "Analytics",
    items: [booleanPermission("analytics.read", "View analytics")],
  },
];

export type PermissionCatalogStorageFieldSchema = {
  type: string;
  description: string;
  endpoint?: string;
};

export type PermissionCatalogSchema = {
  version: 1;
  modules: PermissionModuleDefinition[];
  storage: {
    permissions: PermissionCatalogStorageFieldSchema;
    permissionOptions: PermissionCatalogStorageFieldSchema;
    integrationGrants: PermissionCatalogStorageFieldSchema;
  };
};

/** Full permission schema for GET /permissions/catalog. */
export function getPermissionCatalogSchema(): PermissionCatalogSchema {
  return {
    version: 1,
    modules: PERMISSION_MODULES,
    storage: {
      permissions: {
        type: "string[]",
        description: "Enabled boolean permission keys.",
      },
      permissionOptions: {
        type: "Record<string, string>",
        description: "Option permission values (e.g. orders.visibility).",
      },
      integrationGrants: {
        type: "array",
        description:
          "Per-integration grants with nested conversation permissions.",
        endpoint: "/workspace/roles/:roleId/integration-grants",
      },
    },
  };
}

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

/** @deprecated Use PermissionCatalogBooleanItem */
export type PermissionDefinition = PermissionCatalogBooleanItem;
