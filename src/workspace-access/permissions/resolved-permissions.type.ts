import type { IntegrationType } from "../../integrations/integration-type";
import type { IntegrationGrantConversationPermissions } from "./integration-grant-permissions";

export type VisibilityScope = "mine" | "all";
export type OrderVisibilityScope = "none" | VisibilityScope;

export type ResolvedIntegrationGrant = {
  integrationType: IntegrationType;
  integrationId: number;
} & IntegrationGrantConversationPermissions;

export type ResolvedProductReferenceGrant = {
  integrationType: IntegrationType;
  integrationId: number;
  canManage: boolean;
};

/**
 * Fully resolved workspace permissions for the current user.
 * Use this type in services/controllers to access permission flags and scopes.
 */
export type ResolvedUserPermissions = {
  isOwner: boolean;
  products: {
    enabled: boolean;
    view: boolean;
    createAndEdit: boolean;
    customFieldsManagement: boolean;
    categoryManagement: boolean;
    aiImport: boolean;
    inventoryView: boolean;
    inventoryManage: boolean;
    referencesManagement: boolean;
    export: boolean;
  };
  orders: {
    view: boolean;
    visibility: OrderVisibilityScope;
    create: boolean;
    editStatus: boolean;
    edit: boolean;
    paymentsManage: boolean;
    automationsView: boolean;
    automationsManage: boolean;
  };
  conversations: {
    /** When true, all workspace integrations are granted with full conversation access. */
    fullAccess: boolean;
  };
  clients: {
    viewList: boolean;
  };
  workspace: {
    chatGroupsManagement: boolean;
    templatesManagement: boolean;
    orderStatusesManagement: boolean;
    integrations: boolean;
    rolesManagement: boolean;
    settingsManagement: boolean;
    members: {
      view: boolean;
      invite: boolean;
      delete: boolean;
    };
  };
  analytics: {
    view: boolean;
  };
  /**
   * Per-integration grants with conversation permissions.
   * Missing integration = no access. New integrations are denied until granted.
   */
  integrationGrants: ResolvedIntegrationGrant[];
  /**
   * Per-integration grants for product reference management.
   * Missing integration = cannot manage references for that channel.
   */
  productReferenceGrants: ResolvedProductReferenceGrant[];
};
