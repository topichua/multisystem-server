import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../database/entities';
import { PasswordService } from './crypto/password.service';
import { InvitationTokenService } from './crypto/invitation-token.service';
import { toAuthSnapshot, toSafeUser } from './mappers/user.mapper';
import type { AcceptInviteInput } from './dto/accept-invite.dto';
import type { ChangeEmailInput } from './dto/change-email.dto';
import type { ChangePasswordInput } from './dto/change-password.dto';
import type { ChangePersonalInfoInput } from './dto/change-personal-info.dto';
import type { CreateUserInput } from './dto/create-user.dto';
import type { InviteUserInput, InviteUserResult } from './dto/invite-user.dto';
import type { ListUsersQuery } from './dto/list-users.dto';
import type { UpdateUserInput } from './dto/update-user.dto';
import type {
  PaginatedUsers,
  SafeUser,
  UserAuthSnapshot,
  UserQueryOptions,
} from './types/user-view.types';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly invitationTokenService: InvitationTokenService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async createUser(input: CreateUserInput): Promise<SafeUser> {
    const email = this.normalizeEmail(input.email);
    const existing = await this.findEntityByEmail(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const status =
      input.status ?? (input.password ? UserStatus.Active : UserStatus.Invited);

    const user = this.userRepo.create({
      email,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      status,
      metadata: input.metadata ?? {},
    });

    if (input.password) {
      user.passwordHash = await this.passwordService.hash(input.password);
    }

    const saved = await this.userRepo.save(user);
    return toSafeUser(saved);
  }

  async findById(
    id: number,
    options?: UserQueryOptions,
  ): Promise<SafeUser | null> {
    const user = await this.findEntityById(id, options);
    return user ? toSafeUser(user) : null;
  }

  async findByEmail(
    email: string,
    options?: UserQueryOptions,
  ): Promise<SafeUser | null> {
    const user = await this.findEntityByEmail(
      this.normalizeEmail(email),
      options,
    );
    return user ? toSafeUser(user) : null;
  }

  /**
   * Loads credentials for authentication. Excludes soft-deleted users.
   * Does not return full user rows to callers that only need safe fields.
   */
  async getAuthSnapshotByEmail(
    email: string,
  ): Promise<UserAuthSnapshot | null> {
    const user = await this.findEntityByEmail(this.normalizeEmail(email), {
      includeDeleted: false,
    });
    return user ? toAuthSnapshot(user) : null;
  }

  async listUsers(query: ListUsersQuery = {}): Promise<PaginatedUsers> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
    );
    const [entities, total] = await this.userRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: entities.map(toSafeUser),
      total,
      page,
      limit,
    };
  }

  async updateUser(id: number, input: UpdateUserInput): Promise<SafeUser> {
    const user = await this.requireEntityById(id);
    if (input.firstName !== undefined) {
      user.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      user.lastName = input.lastName;
    }
    if (input.status !== undefined) {
      user.status = input.status;
    }
    if (input.metadata !== undefined) {
      user.metadata = input.metadata;
    }
    if (input.country !== undefined) {
      user.country = input.country;
    }
    if (input.region !== undefined) {
      user.region = input.region;
    }
    if (input.city !== undefined) {
      user.city = input.city;
    }
    if (input.streetLine1 !== undefined) {
      user.streetLine1 = input.streetLine1;
    }
    if (input.streetLine2 !== undefined) {
      user.streetLine2 = input.streetLine2;
    }
    if (input.postalCode !== undefined) {
      user.postalCode = input.postalCode;
    }
    return toSafeUser(await this.userRepo.save(user));
  }

  async softDeleteUser(id: number): Promise<void> {
    await this.requireEntityById(id);
    await this.userRepo.softDelete({ id });
  }

  async inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
    const email = this.normalizeEmail(input.email);
    const taken = await this.findEntityByEmail(email);
    if (taken) {
      throw new ConflictException('Email already in use');
    }

    const rawInvitationToken = this.invitationTokenService.generateRawToken();
    const invitationTokenHash =
      this.invitationTokenService.hash(rawInvitationToken);
    const invitationExpiresAt =
      input.invitationExpiresAt ?? new Date(Date.now() + DEFAULT_INVITE_TTL_MS);

    const user = this.userRepo.create({
      email,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      invitedByUserId: input.invitedByUserId ?? null,
      status: UserStatus.Invited,
      invitedAt: new Date(),
      invitationTokenHash,
      invitationExpiresAt,
      metadata: {},
    });

    const saved = await this.userRepo.save(user);
    return {
      rawInvitationToken,
      user: toSafeUser(saved),
    };
  }

  async acceptInvite(input: AcceptInviteInput): Promise<SafeUser> {
    const tokenHash = this.invitationTokenService.hash(
      input.rawInvitationToken,
    );
    const user = await this.userRepo.findOne({
      where: { invitationTokenHash: tokenHash },
    });
    if (!user) {
      throw new NotFoundException('Invalid or expired invitation');
    }
    if (user.status !== UserStatus.Invited) {
      throw new BadRequestException('Invitation is no longer valid');
    }
    if (
      user.invitationExpiresAt &&
      user.invitationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invitation has expired');
    }

    user.status = UserStatus.Active;
    user.invitationAcceptedAt = new Date();
    user.invitationTokenHash = null;
    user.invitationExpiresAt = null;

    if (input.newPassword) {
      user.passwordHash = await this.passwordService.hash(input.newPassword);
    }

    const saved = await this.userRepo.save(user);
    return toSafeUser(saved);
  }

  async changePersonalInfo(
    id: number,
    input: ChangePersonalInfoInput,
  ): Promise<SafeUser> {
    const user = await this.requireEntityById(id);
    if (input.firstName !== undefined) {
      user.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      user.lastName = input.lastName;
    }
    if (input.country !== undefined) {
      user.country = input.country;
    }
    if (input.region !== undefined) {
      user.region = input.region;
    }
    if (input.city !== undefined) {
      user.city = input.city;
    }
    if (input.streetLine1 !== undefined) {
      user.streetLine1 = input.streetLine1;
    }
    if (input.streetLine2 !== undefined) {
      user.streetLine2 = input.streetLine2;
    }
    if (input.postalCode !== undefined) {
      user.postalCode = input.postalCode;
    }
    if (input.metadata !== undefined) {
      user.metadata = input.metadata;
    }
    if (input.mobilePhonePlain !== undefined) {
      if (input.mobilePhonePlain === null || input.mobilePhonePlain === '') {
        user.mobilePhoneHash = null;
      } else {
        const normalized = input.mobilePhonePlain.replace(/\D/g, '');
        user.mobilePhoneHash =
          normalized.length === 0
            ? null
            : this.invitationTokenService.hash(normalized);
      }
    }
    return toSafeUser(await this.userRepo.save(user));
  }

  async changeEmail(id: number, input: ChangeEmailInput): Promise<SafeUser> {
    const user = await this.requireEntityById(id);
    const next = this.normalizeEmail(input.newEmail);
    if (next === user.email) {
      return toSafeUser(user);
    }
    const other = await this.findEntityByEmail(next);
    if (other && other.id !== user.id) {
      throw new ConflictException('Email already in use');
    }
    user.email = next;
    return toSafeUser(await this.userRepo.save(user));
  }

  async changePassword(
    id: number,
    input: ChangePasswordInput,
  ): Promise<SafeUser> {
    const user = await this.requireEntityById(id);
    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      const match = await this.passwordService.compare(
        input.currentPassword,
        user.passwordHash,
      );
      if (!match) {
        throw new BadRequestException('Invalid current password');
      }
    }
    user.passwordHash = await this.passwordService.hash(input.newPassword);
    return toSafeUser(await this.userRepo.save(user));
  }

  async updateLastSeenAt(id: number, at?: Date): Promise<SafeUser> {
    const user = await this.requireEntityById(id);
    user.lastSeenAt = at ?? new Date();
    return toSafeUser(await this.userRepo.save(user));
  }

  async updateLastLoginAt(id: number, at?: Date): Promise<SafeUser> {
    const user = await this.requireEntityById(id);
    user.lastLoginAt = at ?? new Date();
    return toSafeUser(await this.userRepo.save(user));
  }

  /** Compare a plaintext password to a stored hash (e.g. auth strategies). */
  async verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
    return this.passwordService.compare(plain, passwordHash);
  }

  private async findEntityById(
    id: number,
    options?: UserQueryOptions,
  ): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id },
      withDeleted: options?.includeDeleted === true,
    });
  }

  private async findEntityByEmail(
    email: string,
    options?: UserQueryOptions,
  ): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email },
      withDeleted: options?.includeDeleted === true,
    });
  }

  private async requireEntityById(
    id: number,
    options?: UserQueryOptions,
  ): Promise<User> {
    const user = await this.findEntityById(id, options);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
