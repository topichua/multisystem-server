export type AcceptInviteInput = {
  rawInvitationToken: string;
  /** Optional initial password when accepting (stored hashed only). */
  newPassword?: string;
};
