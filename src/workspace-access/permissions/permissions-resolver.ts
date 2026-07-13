import type { IntegrationType } from "../../integrations/integration-type";
import type { PermissionKey } from "./permission-keys";
import type { PermissionOptionKey } from "./permission-option-keys";
import { getPermissionOptionValue } from "./permission-options.util";
import type { ResolvedIntegrationGrant } from "./resolved-permissions.type";
import type {
  ResolvedUserPermissions,
  VisibilityScope,
} from "./resolved-permissions.type";

export type RawRolePermissions = {
  permissions: string[] | null | undefined;
  permissionOptions: Record<string, string> | null | undefined;
  permissionOptionLists: Record<string, string[]> | null | undefined;
  integrationGrants?: ResolvedIntegrationGrant[];
};

function hasKey(keys: Set<string>, key: PermissionKey): boolean {
  return keys.has(key);
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
): VisibilityScope {
  const value = optionValue(raw, key);
  return value === "all" ? "all" : "mine";
}

/** Workspace owners bypass role restrictions. */
export function resolveOwnerPermissions(
  integrationGrants: ResolvedIntegrationGrant[] = [],
): ResolvedUserPermissions {
  return {
    isOwner: true,
    products: {
      view: true,
      createAndEdit: true,
      customFieldsManagement: true,
      categoryManagement: true,
      aiImport: true,
      inventoryView: true,
      inventoryManage: true,
    },
    orders: {
      view: true,
      visibility: "all",
      create: true,
      editStatus: true,
      edit: true,
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
      integrations: true,
      rolesManagement: true,
      members: { view: true, invite: true, delete: true },
    },
    analytics: { view: true },
    payments: {
      integrationsView: true,
      integrationsManage: true,
      linksCreate: true,
      linksCancel: true,
      view: true,
      manualCreate: true,
      manualMethodsView: true,
      manualMethodsManage: true,
    },
    integrationGrants,
  };
}

export function resolveRolePermissions(
  raw: RawRolePermissions,
): ResolvedUserPermissions {
  const keys = new Set((raw.permissions ?? []).map((k) => k.trim()));

  return {
    isOwner: false,
    products: {
      view: hasKey(keys, "products.read"),
      createAndEdit: hasKey(keys, "products.write"),
      customFieldsManagement: hasKey(keys, "products.custom_fields"),
      categoryManagement: hasKey(keys, "products.category"),
      aiImport: hasKey(keys, "products.ai_import"),
      inventoryView: hasKey(keys, "products.inventory.view"),
      inventoryManage: hasKey(keys, "products.inventory.manage"),
    },
    orders: {
      view: hasKey(keys, "orders.read"),
      visibility: visibilityScope(raw, "orders.visibility"),
      create: hasKey(keys, "orders.create"),
      editStatus: hasKey(keys, "orders.edit_status"),
      edit: hasKey(keys, "orders.edit"),
      automationsView: hasKey(keys, "orders.automations.view"),
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
      integrations: hasKey(keys, "workspace.integrations"),
      rolesManagement: hasKey(keys, "workspace.roles"),
      members: {
        view: hasKey(keys, "workspace.members.read"),
        invite: hasKey(keys, "workspace.members.invite"),
        delete: hasKey(keys, "workspace.members.delete"),
      },
    },
    analytics: {
      view: hasKey(keys, "analytics.read"),
    },
    payments: {
      integrationsView:
        hasKey(keys, "payments.integrations.view") ||
        hasKey(keys, "payments.integrations.manage"),
      integrationsManage: hasKey(keys, "payments.integrations.manage"),
      linksCreate: hasKey(keys, "payments.links.create"),
      linksCancel: hasKey(keys, "payments.links.cancel"),
      view: hasKey(keys, "payments.view"),
      manualCreate: hasKey(keys, "payments.manual.create"),
      manualMethodsView:
        hasKey(keys, "payments.manual_methods.view") ||
        hasKey(keys, "payments.manual_methods.manage"),
      manualMethodsManage: hasKey(keys, "payments.manual_methods.manage"),
    },
    integrationGrants: raw.integrationGrants ?? [],
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

export function hasBooleanPermission(
  resolved: ResolvedUserPermissions,
  key: PermissionKey,
): boolean {
  if (resolved.isOwner) {
    return true;
  }
  switch (key) {
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
    case "products.inventory.view":
      return resolved.products.inventoryView;
    case "products.inventory.manage":
      return resolved.products.inventoryManage;
    case "orders.read":
      return resolved.orders.view;
    case "orders.create":
      return resolved.orders.create;
    case "orders.edit_status":
      return resolved.orders.editStatus;
    case "orders.edit":
      return resolved.orders.edit;
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
    case "analytics.read":
      return resolved.analytics.view;
    case "payments.integrations.view":
      return resolved.payments.integrationsView;
    case "payments.integrations.manage":
      return resolved.payments.integrationsManage;
    case "payments.links.create":
      return resolved.payments.linksCreate;
    case "payments.links.cancel":
      return resolved.payments.linksCancel;
    case "payments.view":
      return resolved.payments.view;
    case "payments.manual.create":
      return resolved.payments.manualCreate;
    case "payments.manual_methods.view":
      return resolved.payments.manualMethodsView;
    case "payments.manual_methods.manage":
      return resolved.payments.manualMethodsManage;
    default:
      return false;
  }
}
