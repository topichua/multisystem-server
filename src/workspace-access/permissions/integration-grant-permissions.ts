import type { VisibilityScope } from "./resolved-permissions.type";

/** Per-integration conversation permissions stored on `workspace_role_integration_grants`. */
export type IntegrationGrantConversationPermissions = {
  read: VisibilityScope;
  write: VisibilityScope;
  assignResponsibility: boolean;
  instagramCommentsView: boolean;
  instagramCommentsWrite: boolean;
};

export const INTEGRATION_GRANT_PERMISSION_CATALOG = [
  {
    key: "read",
    type: "option" as const,
    description: "View conversations",
    options: [
      { value: "all", label: "All" },
      { value: "mine", label: "Mine" },
    ],
    default: "mine",
  },
  {
    key: "write",
    type: "option" as const,
    description: "Write conversation",
    options: [
      { value: "all", label: "All" },
      { value: "mine", label: "Mine" },
    ],
    default: "mine",
  },
  {
    key: "assignResponsibility",
    type: "boolean" as const,
    description: "Assign chat responsibility",
    default: false,
  },
  {
    key: "instagramCommentsView",
    type: "boolean" as const,
    description: "View comments [Instagram]",
    default: false,
    integrationTypes: ["instagram"] as const,
  },
  {
    key: "instagramCommentsWrite",
    type: "boolean" as const,
    description: "Write comments [Instagram]",
    default: false,
    integrationTypes: ["instagram"] as const,
  },
] as const;

export const DEFAULT_INTEGRATION_GRANT_PERMISSIONS: IntegrationGrantConversationPermissions =
  {
    read: "mine",
    write: "mine",
    assignResponsibility: false,
    instagramCommentsView: false,
    instagramCommentsWrite: false,
  };

export function normalizeVisibilityScope(value: unknown): VisibilityScope {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "all" ? "all" : "mine";
}

export function normalizeIntegrationGrantPermissions(
  input: Partial<IntegrationGrantConversationPermissions> | null | undefined,
  integrationType: "instagram" | "telegram",
): IntegrationGrantConversationPermissions {
  const base = {
    read: normalizeVisibilityScope(input?.read),
    write: normalizeVisibilityScope(input?.write),
    assignResponsibility: Boolean(input?.assignResponsibility),
    instagramCommentsView: Boolean(input?.instagramCommentsView),
    instagramCommentsWrite: Boolean(input?.instagramCommentsWrite),
  };
  if (integrationType === "telegram") {
    return {
      ...base,
      instagramCommentsView: false,
      instagramCommentsWrite: false,
    };
  }
  return base;
}
