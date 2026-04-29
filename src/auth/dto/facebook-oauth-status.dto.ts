import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FacebookOAuthStatusDto {
  @ApiPropertyOptional({ nullable: true })
  pageId: string | null;

  @ApiPropertyOptional({ nullable: true })
  pageName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Instagram Business Account id (same as `company.instagram_account_id`).',
  })
  instagramAccountId: string | null;

  @ApiPropertyOptional({ nullable: true })
  tokenStatus: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  tokenConnectedAt: Date | null;
}
