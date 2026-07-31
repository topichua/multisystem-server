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
      "URL to open in a new window to complete OAuth. " +
      "Instagram: Facebook Login. TikTok: Login Kit authorize URL.",
  })
  url: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Correlation id for OAuth. Instagram: poll GET /integrations/instagram/oauth/pages?sessionId=… " +
      "until `select_page`, then confirm. TikTok: poll GET /integrations/tiktok/oauth/status?sessionId=… " +
      "until `connected`.",
  })
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      "ISO 8601 if already connected before starting a new OAuth flow",
  })
  connectedAt?: string;
}
