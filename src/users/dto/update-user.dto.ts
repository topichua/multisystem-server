import { UserStatus } from '../entities/user-status.enum';

/** Non-sensitive profile fields only (no passwords or invitation fields). */
export type UpdateUserInput = {
  firstName?: string;
  lastName?: string | null;
  status?: UserStatus;
  metadata?: Record<string, unknown>;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  postalCode?: string | null;
};
