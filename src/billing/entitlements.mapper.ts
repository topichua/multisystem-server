import type { WorkspaceEntitlementsSnapshot } from "./types/workspace-entitlements.interface";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";

export function entitlementsToSnapshot(
  row: WorkspaceEntitlements,
): WorkspaceEntitlementsSnapshot {
  return {
    socialAccountsLimit: row.socialAccountsLimit,
    privateAccountsLimit: row.privateAccountsLimit,
    wishlistEnabled: row.wishlistEnabled,
    advancedInventoryEnabled: row.advancedInventoryEnabled,
    advancedAnalyticsEnabled: row.advancedAnalyticsEnabled,
    aiCreditsMonthly: row.aiCreditsMonthly,
  };
}

export function applySnapshotToEntitlements(
  row: WorkspaceEntitlements,
  snapshot: WorkspaceEntitlementsSnapshot,
): WorkspaceEntitlements {
  row.socialAccountsLimit = snapshot.socialAccountsLimit;
  row.privateAccountsLimit = snapshot.privateAccountsLimit;
  row.wishlistEnabled = snapshot.wishlistEnabled;
  row.advancedInventoryEnabled = snapshot.advancedInventoryEnabled;
  row.advancedAnalyticsEnabled = snapshot.advancedAnalyticsEnabled;
  row.aiCreditsMonthly = snapshot.aiCreditsMonthly;
  return row;
}
