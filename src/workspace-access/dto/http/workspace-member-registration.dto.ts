import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { WorkspaceMemberResponseDto } from "./workspace-member-response.dto";

export class CompleteWorkspaceMemberRegistrationRequestDto {
  @ApiPropertyOptional({ example: "Alex" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional({ example: "Smith" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  @ApiPropertyOptional({
    example: "StrongPass123!",
    description: "Required when the invited user has no password yet.",
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

export class WorkspaceMemberRegistrationFormResponseDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional({ nullable: true })
  lastName?: string | null;

  @ApiProperty()
  workspaceName: string;

  @ApiProperty()
  roleName: string;

  @ApiProperty({
    description: "When false, the user already has a password and only needs to confirm.",
  })
  requiresPassword: boolean;
}

export class CompleteWorkspaceMemberRegistrationResponseDto {
  @ApiProperty()
  registered: true;

  @ApiProperty()
  access_token: string;

  @ApiProperty({ type: WorkspaceMemberResponseDto })
  member: WorkspaceMemberResponseDto;
}
