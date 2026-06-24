import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { INTEGRATION_TYPES, type IntegrationType } from "../../integration-type";

export class IntegrationListItemDto {
  @ApiProperty({ enum: INTEGRATION_TYPES })
  type: IntegrationType;

  @ApiProperty({
    description:
      "Display name. Instagram: Graph account name (fallback: Facebook Page name). Telegram: phone number.",
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
      "Telegram connect progress (`pending_code`, `active`, …); Instagram rows are only listed when connected",
  })
  status?: string;

  @ApiPropertyOptional({
    description:
      "Instagram only: Business Account id (Graph `instagram_business_account.id`).",
  })
  businessAccountId?: string;

  @ApiPropertyOptional({
    description: "Instagram only: `@username` handle from Graph.",
  })
  userName?: string;

  @ApiPropertyOptional({
    description:
      "Instagram only: profile picture URL from Graph (`profile_picture_url`). `null` when the account has no picture or Graph did not return one.",
    nullable: true,
  })
  avatar?: string | null;

  @ApiPropertyOptional({
    description:
      "Instagram only: follower count from Graph (`followers_count`).",
  })
  followersCount?: number;

  @ApiPropertyOptional({
    description:
      "Instagram only: published post count from Graph (`media_count`).",
  })
  postsCount?: number;
}
