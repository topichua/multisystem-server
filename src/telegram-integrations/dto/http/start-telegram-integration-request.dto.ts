import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from "class-validator";

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
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workspace_id?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      "When true, asks Telegram to deliver the login code via SMS instead of the Telegram app.",
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  force_sms?: boolean;
}
