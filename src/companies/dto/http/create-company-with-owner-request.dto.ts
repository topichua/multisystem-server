import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCompanyWithOwnerRequestDto {
  @ApiProperty({ description: 'Legal or display name of the company' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  companyName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  lastName: string;

  @ApiProperty({ description: 'Plaintext password; stored as bcrypt hash only.', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty({
    description: 'Instagram / Facebook Graph API token (stored on company tokens and source).',
  })
  @IsString()
  @MinLength(1)
  instagramToken: string;

  @ApiPropertyOptional({
    description: 'Facebook Page ID linked to Instagram; stored as company.page_id.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramPageId?: string | null;
}
