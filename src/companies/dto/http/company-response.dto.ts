import { ApiProperty } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  pageId: string;

  @ApiProperty()
  pageToken: string;

  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  ownerId: number;
}
