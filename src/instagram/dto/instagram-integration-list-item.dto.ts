import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InstagramIntegrationListItemDto {
  @ApiProperty({ enum: ["instagram"] })
  type: "instagram";

  @ApiProperty({
    description: "`instagram_integration.id` — pass as `integrationId` on GET /api/instagram/media.",
  })
  id: number;

  @ApiProperty({
    description:
      "Display name from Graph account name (fallback: Facebook Page name).",
  })
  name: string;

  @ApiPropertyOptional({
    description:
      "Instagram Business Account id (Graph `instagram_business_account.id`, stored as `instagram_account_id`).",
  })
  businessAccountId?: string;

  @ApiPropertyOptional({
    description: "Instagram `@username` handle from Graph.",
  })
  userName?: string;

  @ApiPropertyOptional({
    description:
      "Profile picture URL from Graph (`profile_picture_url`). `null` when not available.",
    nullable: true,
  })
  avatar: string | null;

  @ApiPropertyOptional({
    description:
      "ISO 8601 when OAuth / tokens were connected (`token_connected_at`).",
  })
  connectedAt?: string;
}

export class InstagramIntegrationsListResponseDto {
  @ApiProperty({ type: () => [InstagramIntegrationListItemDto] })
  data: InstagramIntegrationListItemDto[];
}
