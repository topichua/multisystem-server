import type { IntegrationType } from "../../integrations/integration-type";
import {
  PRODUCT_CHILD_PERMISSION_KEYS,
  type PermissionKey,
} from "./permission-keys";
import type { PermissionOptionKey } from "./permission-option-keys";
import { getPermissionOptionValue } from "./permission-options.util";
import type {
  ResolvedIntegrationGrant,
  ResolvedProductReferenceGrant,
} from "./resolved-permissions.type";
import type {
  OrderVisibilityScope,
  ResolvedUserPermissions,
} from "./resolved-permissions.type";

export type RawRolePermissions = {
  permissions: string[] | null | undefined;
  permissionOptions: Record<string, string> | null | undefined;
  permissionOptionLists: Record<string, string[]> | null | undefined;
  integrationGrants?: ResolvedIntegrationGrant[];
  productReferenceGrants?: ResolvedProductReferenceGrant[];
};

function hasKey(keys: Set<string>, key: PermissionKey): boolean {
  return keys.has(key);
}

function hasAnyProductChildKey(keys: Set<string>): boolean {
  return PRODUCT_CHILD_PERMISSION_KEYS.some((key) => keys.has(key));
}

function optionValue(
  raw: RawRolePermissions,
  key: PermissionOptionKey,
): string {
  return getPermissionOptionValue(raw.permissionOptions, key);
}

function visibilityScope(
  raw: RawRolePermissions,
  key: PermissionOptionKey,
): OrderVisibilityScope {
  const value = optionValue(raw, key);
  if (value === "all" || value === "mine") {
    return value;
  }
  return "none";
}

/** Workspace owners bypass role restrictions. */
export function resolveOwnerPermissions(
  integrationGrants: ResolvedIntegrationGrant[] = [],
  productReferenceGrants: ResolvedProductReferenceGrant[] = [],
): ResolvedUserPermissions {
  return {
    isOwner: true,
    products: {
      enabled: true,
      view: true,
      createAndEdit: true,
      customFieldsManagement: true,
      categoryManagement: true,
      aiImport: true,
      inventoryView: true,
      inventoryManage: true,
      referencesManagement: true,
      export: true,
    },
    orders: {
      view: true,
      visibility: "all",
      create: true,
      editStatus: true,
      edit: true,
      paymentsManage: true,
      automationsView: true,
      automationsManage: true,
    },
    conversations: {
      fullAccess: true,
    },
    clients: { viewList: true },
    workspace: {
      chatGroupsManagement: true,
      templatesManagement: true,
      orderStatusesManagement: true,
      integrations: true,
      rolesManagement: true,
      settingsManagement: true,
      members: { view: true, invite: true, delete: true },
    },
    analytics: { view: true },
    integrationGrants,
    productReferenceGrants,
  };
}

export function resolveRolePermissions(
  raw: RawRolePermissions,
): ResolvedUserPermissions {
  const keys = new Set((raw.permissions ?? []).map((k) => k.trim()));
  const enabled =
    hasKey(keys, "products.enabled") || hasAnyProductChildKey(keys);
  const inventoryManage =
    enabled && hasKey(keys, "products.inventory.manage");
  const inventoryView =
    enabled &&
    (hasKey(keys, "products.inventory.view") || inventoryManage);
  const ordersVisibility = visibilityScope(raw, "orders.visibility");
  const ordersEdit =
    hasKey(keys, "orders.edit") || hasKey(keys, "orders.edit_status");

  return {
    isOwner: false,
    products: {
      enabled,
      view: enabled && hasKey(keys, "products.read"),
      createAndEdit: enabled && hasKey(keys, "products.write"),
      customFieldsManagement:
        enabled && hasKey(keys, "products.custom_fields"),
      categoryManagement: enabled && hasKey(keys, "products.category"),
      aiImport: enabled && hasKey(keys, "products.ai_import"),
      inventoryView,
      inventoryManage,
      referencesManagement:
        enabled && hasKey(keys, "products.references.manage"),
      export: enabled && hasKey(keys, "products.export"),
    },
    orders: {
      view: ordersVisibility !== "none",
      visibility: ordersVisibility,
      create: hasKey(keys, "orders.create"),
      editStatus: ordersEdit,
      edit: ordersEdit,
      paymentsManage: hasKey(keys, "orders.payments.manage"),
      automationsView:
        hasKey(keys, "orders.automations.view") ||
        hasKey(keys, "orders.automations.manage"),
      automationsManage: hasKey(keys, "orders.automations.manage"),
    },
    conversations: {
      fullAccess: hasKey(keys, "conversations.full_access"),
    },
    clients: {
      viewList: hasKey(keys, "clients.read"),
    },
    workspace: {
      chatGroupsManagement: hasKey(keys, "workspace.chat_groups"),
      templatesManagement: hasKey(keys, "workspace.templates"),
      orderStatusesManagement: hasKey(keys, "workspace.order_statuses"),
      integrations: hasKey(keys, "workspace.integrations"),
      rolesManagement: hasKey(keys, "workspace.roles"),
      settingsManagement: hasKey(keys, "workspace.settings"),
      members: {
        view: hasKey(keys, "workspace.members.read"),
        invite: hasKey(keys, "workspace.members.invite"),
        delete: hasKey(keys, "workspace.members.delete"),
      },
    },
    analytics: {
      view: hasKey(keys, "analytics.read"),
    },
    integrationGrants: raw.integrationGrants ?? [],
    productReferenceGrants: raw.productReferenceGrants ?? [],
  };
}

export function getIntegrationGrant(
  resolved: ResolvedUserPermissions,
  integrationType: IntegrationType,
  integrationId: number,
): ResolvedIntegrationGrant | null {
  if (resolved.isOwner || resolved.conversations.fullAccess) {
    return {
      integrationType,
      integrationId,
      read: "all",
      write: "all",
      assignResponsibility: true,
      canTakeChat: true,
      instagramCommentsView: integrationType === "instagram",
      instagramCommentsWrite: integrationType === "instagram",
    };
  }
  return (
    resolved.integrationGrants.find(
      (grant) =>
        grant.integrationType === integrationType &&
        grant.integrationId === integrationId,
    ) ?? null
  );
}

export function canAssignConversationResponsibility(
  resolved: ResolvedUserPermissions,
  integrationType: IntegrationType,
  integrationId: number,
): boolean {
  return (
    getIntegrationGrant(resolved, integrationType, integrationId)
      ?.assignResponsibility === true
  );
}

export function canTakeChat(
  resolved: ResolvedUserPermissions,
  integrationType: IntegrationType,
  integrationId: number,
): boolean {
  return (
    getIntegrationGrant(resolved, integrationType, integrationId)
      ?.canTakeChat === true
  );
}

export function canManageProductReferences(
  resolved: ResolvedUserPermissions,
  integrationType: IntegrationType,
  integrationId: number,
): boolean {
  if (resolved.isOwner) {
    return true;
  }
  if (
    !resolved.products.enabled ||
    !resolved.products.referencesManagement
  ) {
    return false;
  }
  return (
    resolved.productReferenceGrants.find(
      (grant) =>
        grant.integrationType === integrationType &&
        grant.integrationId === integrationId &&
        grant.canManage,
    ) != null
  );
}

export function hasBooleanPermission(
  resolved: ResolvedUserPermissions,
  key: PermissionKey,
): boolean {
  if (resolved.isOwner) {
    return true;
  }
  switch (key) {
    case "products.enabled":
      return resolved.products.enabled;
    case "products.read":
      return resolved.products.view;
    case "products.write":
      return resolved.products.createAndEdit;
    case "products.custom_fields":
      return resolved.products.customFieldsManagement;
    case "products.category":
      return resolved.products.categoryManagement;
    case "products.ai_import":
      return resolved.products.aiImport;
    case "products.export":
      return resolved.products.export;
    case "products.inventory.view":
      return resolved.products.inventoryView;
    case "products.inventory.manage":
      return resolved.products.inventoryManage;
    case "products.references.manage":
      return resolved.products.referencesManagement;
    case "orders.read":
      return resolved.orders.view;
    case "orders.create":
      return resolved.orders.create;
    case "orders.edit_status":
      return resolved.orders.editStatus;
    case "orders.edit":
      return resolved.orders.edit;
    case "orders.payments.manage":
      return resolved.orders.paymentsManage;
    case "orders.automations.view":
      return resolved.orders.automationsView;
    case "orders.automations.manage":
      return resolved.orders.automationsManage;
    case "conversations.full_access":
      return resolved.conversations.fullAccess;
    case "clients.read":
      return resolved.clients.viewList;
    case "workspace.chat_groups":
      return resolved.workspace.chatGroupsManagement;
    case "workspace.templates":
      return resolved.workspace.templatesManagement;
    case "workspace.order_statuses":
      return resolved.workspace.orderStatusesManagement;
    case "workspace.integrations":
      return resolved.workspace.integrations;
    case "workspace.roles":
      return resolved.workspace.rolesManagement;
    case "workspace.members.read":
      return resolved.workspace.members.view;
    case "workspace.members.invite":
      return resolved.workspace.members.invite;
    case "workspace.members.delete":
      return resolved.workspace.members.delete;
    case "workspace.settings":
      return resolved.workspace.settingsManagement;
    case "analytics.read":
      return resolved.analytics.view;
    default:
      return false;
  }
}
