import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { INTEGRATION_TYPES, type IntegrationType } from "../../integration-type";

export class IntegrationListItemDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  type: IntegrationType;

  @ApiProperty({
    description: "Display name (Facebook Page name or workspace integration name)",
  })
  name: string;

  @ApiProperty({
    description:
      "Integration id for this type (e.g. `instagram_integration.id` when type is instagram)",
  })
  id: number;

  @ApiPropertyOptional({
    description:
      "ISO 8601 when OAuth / tokens were connected (`token_connected_at`); omitted when not connected",
  })
  connectedAt?: string;

  @ApiPropertyOptional({
    description:
      "Connection state: Telegram (`pending_code`, `active`, …) or Instagram (`disconnected` after DELETE without `permanent`)",
  })
  status?: string;
}
