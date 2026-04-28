import { ApiProperty } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  pageId: string;

  @ApiProperty()
  businessAccountId: string;

  @ApiProperty()
  accessToken: string;

  @ApiPropertyOptional({ nullable: true })
  instagramAccountId: string | null;

  @ApiProperty()
  ownerId: number;
}
