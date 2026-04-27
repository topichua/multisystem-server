import { User } from '../../database/entities';
import { SafeUser, UserAuthSnapshot } from '../types/user-view.types';

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobilePhoneHash: user.mobilePhoneHash,
    status: user.status,
    invitedAt: user.invitedAt,
    invitedByUserId: user.invitedByUserId,
    invitationExpiresAt: user.invitationExpiresAt,
    invitationAcceptedAt: user.invitationAcceptedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    lastSeenAt: user.lastSeenAt,
    lastLoginAt: user.lastLoginAt,
    country: user.country,
    region: user.region,
    city: user.city,
    streetLine1: user.streetLine1,
    streetLine2: user.streetLine2,
    postalCode: user.postalCode,
    metadata: user.metadata,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  };
}

export function toAuthSnapshot(user: User): UserAuthSnapshot {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    status: user.status,
  };
}
