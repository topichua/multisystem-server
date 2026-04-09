import { UserStatus } from '../entities/user-status.enum';

export type CreateUserInput = {
  email: string;
  firstName: string;
  lastName?: string | null;
  /** Plaintext password; never persisted except as hash. */
  password?: string;
  status?: UserStatus;
  metadata?: Record<string, unknown>;
};
