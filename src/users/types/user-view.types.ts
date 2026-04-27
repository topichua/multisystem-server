import { UserStatus } from '../../database/entities';

/** Public user shape (no password or invitation token secrets). */
export type SafeUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  mobilePhoneHash: string | null;
  status: UserStatus;
  invitedAt: Date | null;
  invitedByUserId: number | null;
  invitationExpiresAt: Date | null;
  invitationAcceptedAt: Date | null;
  emailVerifiedAt: Date | null;
  lastSeenAt: Date | null;
  lastLoginAt: Date | null;
  country: string | null;
  region: string | null;
  city: string | null;
  streetLine1: string | null;
  streetLine2: string | null;
  postalCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** Minimal fields for authentication (password verification). */
export type UserAuthSnapshot = {
  id: number;
  email: string;
  passwordHash: string | null;
  status: UserStatus;
};

export type PaginatedUsers = {
  items: SafeUser[];
  total: number;
  page: number;
  limit: number;
};

export type UserQueryOptions = {
  /** When true, include soft-deleted rows. Default false. */
  includeDeleted?: boolean;
};
