import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../database/entities';

export class CompanyMeDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  pageId: string;
}

export class UserMeDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status: UserStatus;

  @ApiPropertyOptional({ nullable: true })
  invitedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId: number | null;

  @ApiPropertyOptional({ nullable: true })
  invitationExpiresAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  invitationAcceptedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  emailVerifiedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastSeenAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class MeResponseDto {
  @ApiProperty()
  email: string;

  @ApiProperty({ example: 'super_admin' })
  role: string;

  @ApiPropertyOptional({ type: UserMeDto, nullable: true })
  user: UserMeDto | null;

  @ApiPropertyOptional({ type: CompanyMeDto, nullable: true })
  company: CompanyMeDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Company display name when a company row exists for this user',
  })
  companyName: string | null;
}
