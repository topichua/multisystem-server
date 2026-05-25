import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { INTEGRATION_TYPES, type IntegrationType } from "../../integration-type";

export class CreateIntegrationResponseDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  type: IntegrationType;

  @ApiProperty({ description: "`instagram_integration.id` for this row" })
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description:
      "URL to open in a new window to complete Facebook Login (Instagram / Page tokens)",
  })
  url: string;

  @ApiPropertyOptional({
    description: "ISO 8601 if already connected before starting a new OAuth flow",
  })
  connectedAt?: string;
}
