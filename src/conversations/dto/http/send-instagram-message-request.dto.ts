import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendInstagramMessageRequestDto {
  @ApiProperty({
    description:
      'PSID / IGSID of the recipient (from UI: `participants[1].id`).',
  })
  @IsString()
  @MinLength(1)
  recipientId: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  message: string;
}
