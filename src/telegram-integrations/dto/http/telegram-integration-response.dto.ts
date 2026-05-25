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

  @ApiPropertyOptional({ description: "ISO 8601 when user-account session became active" })
  connectedAt?: string;

  @ApiPropertyOptional({
    description: "Next step hint for the client UI",
  })
  nextStep?: string;
}
