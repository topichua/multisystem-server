import type { SafeUser } from '../types/user-view.types';

export type InviteUserInput = {
  email: string;
  firstName: string;
  lastName?: string | null;
  invitedByUserId?: number | null;
  /** Invitation expiry; default 72 hours from now. */
  invitationExpiresAt?: Date;
};

export type InviteUserResult = {
  rawInvitationToken: string;
  user: SafeUser;
};
