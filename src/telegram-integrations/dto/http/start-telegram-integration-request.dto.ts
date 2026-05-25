import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class StartTelegramIntegrationRequestDto {
  @ApiProperty({
    description: "Personal Telegram account phone in E.164 format",
    example: "+380501234567",
  })
  @IsString()
  @MinLength(8)
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: "phone_number must be E.164, e.g. +380501234567",
  })
  phone_number: string;

  @ApiPropertyOptional({
    description: "Workspace id (defaults to your primary workspace)",
  })
  @IsOptional()
  workspace_id?: number;
}
