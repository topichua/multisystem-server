import { ApiProperty } from "@nestjs/swagger";
import { TelegramIntegrationResponseDto } from "./telegram-integration-response.dto";

export class TelegramIntegrationsListResponseDto {
  @ApiProperty()
  workspaceId: number;

  @ApiProperty({ type: [TelegramIntegrationResponseDto] })
  items: TelegramIntegrationResponseDto[];
}
