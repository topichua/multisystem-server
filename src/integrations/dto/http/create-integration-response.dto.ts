import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  INTEGRATION_TYPES,
  type IntegrationType,
} from "../../integration-type";

export class CreateIntegrationResponseDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  type: IntegrationType;

  @ApiPropertyOptional({
    description:
      "`instagram_integration.id` when reconnecting an existing Page; omitted for a new Page connection",
  })
  id?: number;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description:
      "URL to open in a new window to complete Facebook Login (Instagram / Page tokens). " +
      "A workspace may have multiple Instagram integrations (one per Facebook Page).",
  })
  url: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Correlation id for Instagram OAuth. Poll GET /integrations/instagram/oauth/pages?sessionId=… " +
      "until status is `select_page`, then confirm.",
  })
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      "ISO 8601 if already connected before starting a new OAuth flow",
  })
  connectedAt?: string;
}
