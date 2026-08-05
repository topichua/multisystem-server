import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TelegramIntegrationStatus } from "../../../database/entities/telegram-integration-status.enum";

export class TelegramIntegrationResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty({ enum: TelegramIntegrationStatus })
  status: TelegramIntegrationStatus;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: "+380501234567" })
  phoneNumber: string;

  @ApiPropertyOptional()
  telegramUserId?: string;

  @ApiPropertyOptional()
  telegramUsername?: string;

  @ApiPropertyOptional({
    description: "ISO 8601 when user-account session became active",
  })
  connectedAt?: string;

  @ApiPropertyOptional({
    description: "Server instance id currently listening (if lock held)",
  })
  listenerInstanceId?: string;

  @ApiPropertyOptional({
    description: "ISO 8601 of last listener lock heartbeat",
  })
  listenerHeartbeatAt?: string;

  @ApiPropertyOptional({
    description: "Last fatal listener error (e.g. AUTH_KEY_DUPLICATED)",
  })
  lastError?: string;

  @ApiPropertyOptional({
    description: "Next step hint for the client UI",
  })
  nextStep?: string;

  @ApiPropertyOptional({
    enum: ["telegram_app", "sms"],
    description:
      "Where Telegram delivered the login code (from GramJS `isCodeViaApp`).",
  })
  codeDelivery?: "telegram_app" | "sms";

  @ApiProperty({
    description:
      "When true, new live chats on this channel are auto-distributed to eligible members " +
      "with work_status `accepting_new_chats`.",
    example: false,
  })
  chat_auto_distribution: boolean;
}
