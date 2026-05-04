import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name: string;

  @ApiPropertyOptional({ description: 'Optional; stored as empty string if omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  delivery_info: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Instagram scoped user id (`instagram_users.id`). Omit or null for a client with no linked Instagram account.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramId?: string | null;
}
