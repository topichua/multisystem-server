const WORKSPACE_MEMBER_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#F43F5E",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
] as const;

export function pickWorkspaceMemberColor(
  userId: number,
  workspaceId: number,
): string {
  const seed = userId + workspaceId * 9973;
  return WORKSPACE_MEMBER_COLORS[Math.abs(seed) % WORKSPACE_MEMBER_COLORS.length];
}

export function assignWorkspaceMemberColor(
  userId: number,
  workspaceId: number,
  avatarSrc: string | null | undefined,
): string | null {
  if (avatarSrc?.trim()) {
    return null;
  }
  return pickWorkspaceMemberColor(userId, workspaceId);
}

export function resolveWorkspaceMemberColor(
  userId: number,
  workspaceId: number,
  avatarSrc: string | null | undefined,
  storedColor: string | null | undefined,
): string | null {
  if (avatarSrc?.trim()) {
    return null;
  }
  const trimmed = storedColor?.trim();
  if (trimmed) {
    return trimmed;
  }
  return pickWorkspaceMemberColor(userId, workspaceId);
}
