import { ApiPropertyOptional } from '@nestjs/swagger';

export class SendInstagramMessageResponseDto {
  @ApiPropertyOptional()
  recipient_id?: string;

  @ApiPropertyOptional()
  message_id?: string;
}
