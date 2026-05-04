import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  deliveryInfo: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Instagram scoped user id when linked; null if none.',
  })
  instagramUserId: string | null;

  @ApiProperty()
  workspaceId: number;
}
