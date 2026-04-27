import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

function normalizeRecipientIdInDto(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value)
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\s\u00a0\u200b-\u200d\ufeff,]+/g, '');
  return s.length === 0 ? undefined : s;
}

export class SendInstagramMessageRequestDto {
  @ApiPropertyOptional({
    description:
      'Instagram PSID (digits only). JSON number is OK. Spaces, commas, and quotes are stripped. Omit to auto-resolve from the conversation.',
    example: '17841400008459956',
  })
  @Transform(({ value }) => normalizeRecipientIdInDto(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, {
    message:
      'recipientId must be digits only (Instagram PSID). Omit it to resolve from the thread.',
  })
  recipientId?: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  message: string;
}
