import { ApiProperty } from '@nestjs/swagger';

export class SyncConversationsResponseDto {
  @ApiProperty({
    description: 'Number of conversations written or updated in this run.',
  })
  upserted: number;
}
