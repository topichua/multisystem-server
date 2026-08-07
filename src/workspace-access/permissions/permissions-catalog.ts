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

export type PermissionCatalogProductReferenceGrantsItem = {
  type: "product_reference_grants";
  key: "product_reference_grants";
  label: string;
  description: string;
  storage: "productReferenceGrants";
  manageEndpoint: "/workspace/roles/:roleId/product-reference-grants";
  requires: PermissionKey[];
};

export type PermissionCatalogNode =
  | PermissionCatalogBooleanItem
  | PermissionCatalogOptionItem
  | PermissionCatalogGroupItem
  | PermissionCatalogIntegrationGrantsItem
  | PermissionCatalogProductReferenceGrantsItem;

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
    label: "За інтеграцією",
    description:
      "Доступ до розмов по кожній інтеграції Instagram/Telegram. " +
      "Нові інтеграції заборонені, доки їх не надано.",
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

function productReferenceGrantsSchema(): PermissionCatalogProductReferenceGrantsItem {
  return {
    type: "product_reference_grants",
    key: "product_reference_grants",
    label: "За каналом",
    description:
      "Керування референсами по інтеграціях робочого простору (Instagram, Telegram). " +
      "Потрібне право «Керування референсами».",
    storage: "productReferenceGrants",
    manageEndpoint: "/workspace/roles/:roleId/product-reference-grants",
    requires: ["products.enabled", "products.references.manage"],
  };
}

/** Static catalog for API + role validation (not stored in DB). */
export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  {
    module: "products",
    label: "Товари",
    items: [
      booleanPermission("products.enabled", "Товари"),
      booleanPermission("products.read", "Перегляд товарів"),
      booleanPermission(
        "products.write",
        "Створення та редагування товарів",
      ),
      booleanPermission(
        "products.custom_fields",
        "Керування характеристиками",
      ),
      booleanPermission("products.category", "Керування категоріями"),
      booleanPermission("products.inventory.manage", "Керування інвентарем"),
      booleanPermission("products.export", "Експорт товарів"),
      booleanPermission(
        "products.references.manage",
        "Керування референсами",
      ),
      productReferenceGrantsSchema(),
    ],
  },
  {
    module: "orders",
    label: "Замовлення",
    items: [
      {
        type: "group",
        key: "orders.scope",
        label: "Доступ",
        scope: optionPermission(
          "orders.visibility",
          "Доступ до замовлень",
          {
            none: "Немає",
            mine: "Лише свої",
            all: "Усі",
          },
        ),
        items: [
          booleanPermission("orders.create", "Створення замовлень"),
          booleanPermission(
            "orders.edit",
            "Редагування та зміна статусу",
          ),
          booleanPermission(
            "orders.payments.manage",
            "Керування платежами",
          ),
        ],
      },
    ],
  },
  {
    module: "conversations",
    label: "Розмови",
    items: [
      booleanPermission(
        "conversations.full_access",
        "Повний доступ до всіх інтеграцій (читання, запис, коментарі Instagram). Ігнорує права по інтеграціях.",
      ),
      integrationGrantsSchema(),
    ],
  },
  {
    module: "clients",
    label: "Клієнти",
    items: [booleanPermission("clients.read", "Перегляд списку клієнтів")],
  },
  {
    module: "workspace",
    label: "Робочий простір",
    items: [
      booleanPermission(
        "workspace.chat_groups",
        "Керування групами чатів",
      ),
      booleanPermission("workspace.templates", "Керування шаблонами"),
      booleanPermission(
        "workspace.order_statuses",
        "Керування статусами замовлень",
      ),
      booleanPermission(
        "orders.automations.manage",
        "Керування автоматизацією",
      ),
      booleanPermission("workspace.integrations", "Керування інтеграціями"),
      booleanPermission(
        "workspace.roles",
        "Керування ролями та доступами",
      ),
      booleanPermission("workspace.members.invite", "Запрошення учасників"),
      booleanPermission("workspace.members.delete", "Видалення учасників"),
      booleanPermission("workspace.settings", "Налаштування системи"),
    ],
  },
  {
    module: "ai",
    label: "ШІ",
    items: [
      booleanPermission("products.ai_import", "ШІ імпорт товарів"),
    ],
  },
  {
    module: "analytics",
    label: "Аналітика",
    items: [booleanPermission("analytics.read", "Перегляд аналітики")],
  },
];

export type PermissionCatalogStorageFieldSchema = {
  type: string;
  description: string;
  endpoint?: string;
};

export type PermissionCatalogSchema = {
  version: 2;
  modules: PermissionModuleDefinition[];
  storage: {
    permissions: PermissionCatalogStorageFieldSchema;
    permissionOptions: PermissionCatalogStorageFieldSchema;
    integrationGrants: PermissionCatalogStorageFieldSchema;
    productReferenceGrants: PermissionCatalogStorageFieldSchema;
  };
};

/** Full permission schema for GET /permissions/catalog. */
export function getPermissionCatalogSchema(): PermissionCatalogSchema {
  return {
    version: 2,
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
      productReferenceGrants: {
        type: "array",
        description:
          "Per-integration grants for product reference management.",
        endpoint: "/workspace/roles/:roleId/product-reference-grants",
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
