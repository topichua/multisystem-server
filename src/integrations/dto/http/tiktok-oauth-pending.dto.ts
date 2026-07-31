import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TIKTOK_OAUTH_PENDING_STATUSES } from "../../../database/entities/tiktok-oauth-pending-session.entity";

export class TikTokOAuthPendingPollResponseDto {
  @ApiProperty({ format: "uuid" })
  sessionId: string;

  @ApiProperty({ enum: TIKTOK_OAUTH_PENDING_STATUSES })
  status: (typeof TIKTOK_OAUTH_PENDING_STATUSES)[number];

  @ApiPropertyOptional({
    description:
      "`tiktok_integrations.id` when status is `connected`; omitted otherwise",
  })
  integrationId?: number | null;

  @ApiProperty({
    description: "ISO 8601 expiry of this correlation session",
  })
  expiresAt: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Present when status is `failed`",
  })
  error?: string | null;
}
