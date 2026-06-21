import { ApiProperty } from "@nestjs/swagger";
import { TelegramIntegrationStatus } from "../../../database/entities/telegram-integration-status.enum";

export class StartTelegramQrLoginResponseDto {
  @ApiProperty({ description: "`telegram_integrations.id` for this QR login attempt" })
  integrationId: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty({ enum: TelegramIntegrationStatus })
  status: TelegramIntegrationStatus;

  @ApiProperty({
    description:
      "Deep link to encode as QR (`tg://login?token=…`). Scan with Telegram mobile app.",
    example: "tg://login?token=AQF…",
  })
  qrLoginUrl: string;

  @ApiProperty({
    description:
      "Ready-to-use QR image URL for `<img src={qrImageUrl} />` in React.",
    example:
      "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=tg%3A%2F%2Flogin%3Ftoken%3DAQF…",
  })
  qrImageUrl: string;

  @ApiProperty({
    description: "Base64url login token (same value as in `qrLoginUrl` query param).",
  })
  qrToken: string;

  @ApiProperty({
    description: "ISO 8601 when this QR token expires; request a fresh one after that.",
  })
  expiresAt: string;

  @ApiProperty({
    description: "Next API call after the user scans the QR code in Telegram.",
    example:
      "Scan the QR in Telegram, then call POST /telegram-integrations/:id/qr-login/confirm",
  })
  nextStep: string;
}
