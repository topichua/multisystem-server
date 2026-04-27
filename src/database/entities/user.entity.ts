import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from './user-status.enum';

@Entity('users')
@Index('IDX_users_status', ['status'])
@Index('IDX_users_last_seen_at', ['lastSeenAt'])
@Index('IDX_users_invited_by_user_id', ['invitedByUserId'])
@Check(`"status" IN (0, 1, 2)`)
export class User {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 120, nullable: true })
  lastName: string | null;

  @Column({
    name: 'mobile_phone_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  mobilePhoneHash: string | null;

  @Column({
    name: 'status',
    type: 'smallint',
    default: UserStatus.Invited,
  })
  status: UserStatus;

  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true })
  invitedAt: Date | null;

  @Column({ name: 'invited_by_user_id', type: 'int', nullable: true })
  invitedByUserId: number | null;

  @Column({ name: 'invitation_token_hash', type: 'text', nullable: true })
  invitationTokenHash: string | null;

  @Column({
    name: 'invitation_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  invitationExpiresAt: Date | null;

  @Column({
    name: 'invitation_accepted_at',
    type: 'timestamptz',
    nullable: true,
  })
  invitationAcceptedAt: Date | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'country', type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Column({ name: 'region', type: 'varchar', length: 120, nullable: true })
  region: string | null;

  @Column({ name: 'city', type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({
    name: 'street_line_1',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  streetLine1: string | null;

  @Column({
    name: 'street_line_2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  streetLine2: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 40, nullable: true })
  postalCode: string | null;

  @Column({
    name: 'metadata',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
