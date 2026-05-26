import type { InstagramIntegration } from "../database/entities";

export const INSTAGRAM_TOKEN_STATUS_ACTIVE = "active";
export const INSTAGRAM_TOKEN_STATUS_DISCONNECTED = "disconnected";

/** True when the row has a usable Page token and is not explicitly disconnected. */
export function isInstagramIntegrationConnected(
  row: InstagramIntegration,
): boolean {
  if (row.tokenStatus?.trim() === INSTAGRAM_TOKEN_STATUS_DISCONNECTED) {
    return false;
  }
  const pageId = row.pageId?.trim();
  if (!pageId || pageId === "pending") {
    return false;
  }
  return Boolean(row.accessToken?.trim());
}
