import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../entities/user-status.enum';

/** API response shape — never includes password_hash or invitation_token_hash. */
export class SafeUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({ nullable: true })
  mobilePhoneHash: string | null;

  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.Invited,
    description: '0 = invited, 1 = active, 2 = disabled (stored as smallint)',
  })
  status: UserStatus;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  invitedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  invitationExpiresAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  invitationAcceptedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  emailVerifiedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  lastSeenAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  lastLoginAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  country: string | null;

  @ApiPropertyOptional({ nullable: true })
  region: string | null;

  @ApiPropertyOptional({ nullable: true })
  city: string | null;

  @ApiPropertyOptional({ nullable: true })
  streetLine1: string | null;

  @ApiPropertyOptional({ nullable: true })
  streetLine2: string | null;

  @ApiPropertyOptional({ nullable: true })
  postalCode: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  deletedAt: Date | null;
}
