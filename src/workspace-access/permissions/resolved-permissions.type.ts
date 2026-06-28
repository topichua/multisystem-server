import type { IntegrationType } from "../../integrations/integration-type";
import type { IntegrationGrantConversationPermissions } from "./integration-grant-permissions";

export type VisibilityScope = "all" | "mine";

export type ResolvedIntegrationGrant = {
  integrationType: IntegrationType;
  integrationId: number;
} & IntegrationGrantConversationPermissions;

/**
 * Fully resolved workspace permissions for the current user.
 * Use this type in services/controllers to access permission flags and scopes.
 */
export type ResolvedUserPermissions = {
  isOwner: boolean;
  products: {
    view: boolean;
    createAndEdit: boolean;
    customFieldsManagement: boolean;
    categoryManagement: boolean;
    aiImport: boolean;
    inventoryView: boolean;
    inventoryManage: boolean;
  };
  orders: {
    view: boolean;
    visibility: VisibilityScope;
    create: boolean;
    editStatus: boolean;
    edit: boolean;
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
    integrations: boolean;
    rolesManagement: boolean;
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
};
