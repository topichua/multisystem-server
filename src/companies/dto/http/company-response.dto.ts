import { ApiProperty } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  pageId: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Long-lived Facebook **user** token (`company.user_access_token`).',
  })
  userAccessToken: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Facebook **Page** access token from `me/accounts` (`company.access_token`). Also in `sources.token`.',
  })
  accessToken: string | null;

  @ApiPropertyOptional({ nullable: true })
  instagramAccountId: string | null;

  @ApiProperty()
  ownerId: number;
}
