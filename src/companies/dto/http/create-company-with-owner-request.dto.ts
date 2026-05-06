import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateCompanyWithOwnerRequestDto {
  @ApiProperty({ description: "Workspace display name" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  workspace_name: string;

  @ApiProperty({
    description: "Email for the new owner user (login identifier)",
  })
  @IsEmail()
  user_email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name: string;

  @ApiPropertyOptional({
    description: "Optional; omit or send empty string for no last name.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  @ApiProperty({
    description:
      "Plaintext password for the new owner; stored as bcrypt hash only.",
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
