import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** POST /conversations/:id/messages — body must be this object only (no other fields). */
export class SendInstagramMessageRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  message: string;
}
