export type ChangePasswordInput = {
  /** Plaintext new password. */
  newPassword: string;
  /** Required when the user already has a password set. */
  currentPassword?: string;
};
