import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InstagramIntegrationListItemDto {
  @ApiProperty({
    description: "`instagram_integration.id` — pass as `integrationId` on GET /api/instagram/media.",
  })
  id: number;

  @ApiProperty({
    description: "Facebook Page name or integration display name.",
  })
  name: string;

  @ApiPropertyOptional({
    description:
      "Instagram Business Account id (Graph `instagram_business_account.id`, stored as `instagram_account_id`).",
  })
  businessAccountId?: string;
}

export class InstagramIntegrationsListResponseDto {
  @ApiProperty({ type: () => [InstagramIntegrationListItemDto] })
  data: InstagramIntegrationListItemDto[];
}
