import { UserStatus } from '../../database/entities';

export type CreateUserInput = {
  email: string;
  firstName: string;
  lastName?: string | null;
  /** Plaintext password; never persisted except as hash. */
  password?: string;
  status?: UserStatus;
  metadata?: Record<string, unknown>;
};
