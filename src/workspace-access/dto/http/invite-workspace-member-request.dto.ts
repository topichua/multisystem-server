import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class InviteWorkspaceMemberRequestDto {
  @ApiProperty({ example: "agent@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ description: "Role id from GET /workspace/roles" })
  @IsInt()
  @IsPositive()
  role_id: number;

  @ApiPropertyOptional({
    description:
      "Testing only: create user with password \"password\" and skip email confirmation",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  skipConfirmation?: boolean;

  @ApiPropertyOptional({ example: "Alex" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;
}
