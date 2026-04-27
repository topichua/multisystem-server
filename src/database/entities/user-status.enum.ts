/**
 * Persisted as PostgreSQL `smallint` (2 bytes).
 * @see UserStatusLabels for display strings
 */
export enum UserStatus {
  Invited = 0,
  Active = 1,
  Disabled = 2,
}

export const UserStatusLabels: Record<UserStatus, string> = {
  [UserStatus.Invited]: 'invited',
  [UserStatus.Active]: 'active',
  [UserStatus.Disabled]: 'disabled',
};
