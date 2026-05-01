import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';

/** POST /conversations/:conversationId/messages */
export class SendInstagramMessageRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Optional. Omit, null, or empty string for a normal message. Set to the parent message `id` (Graph `mid`) from GET .../messages to send a threaded reply (must exist in this conversation).',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    const s = typeof value === 'string' ? value : String(value);
    const t = s.trim();
    return t.length > 0 ? t : undefined;
  })
  @IsString()
  @MinLength(1)
  reply_to_id?: string;
}
