/** Effective limits/features for a workspace (source of truth for enforcement). */
export type WorkspaceEntitlementsSnapshot = {
  socialAccountsLimit: number | null;
  privateAccountsLimit: number | null;
  wishlistEnabled: boolean;
  advancedInventoryEnabled: boolean;
  advancedAnalyticsEnabled: boolean;
  aiCreditsMonthly: number;
};

export type WorkspaceEntitlementsUsage = {
  socialAccounts: number;
  privateAccounts: number;
  aiCreditsUsed: number;
};
