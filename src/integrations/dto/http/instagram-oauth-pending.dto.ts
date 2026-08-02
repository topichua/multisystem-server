import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsUUID } from "class-validator";
import { INSTAGRAM_OAUTH_PENDING_STATUSES } from "../../../database/entities/instagram-oauth-pending-session.entity";

export class InstagramOAuthPageOptionDto {
  @ApiProperty({ example: "17841400000000000" })
  pageId!: string;

  @ApiProperty({ example: "My Shop" })
  pageName!: string;

  @ApiProperty({ example: "17841401234567890" })
  instagramAccountId!: string;
}

export class InstagramOAuthPendingPollResponseDto {
  @ApiProperty({ format: "uuid" })
  sessionId!: string;

  @ApiProperty({
    enum: INSTAGRAM_OAUTH_PENDING_STATUSES,
    description:
      "`awaiting_facebook` — keep polling. " +
      "`select_page` — pages ready, show picker. " +
      "`failed` — show error and restart from POST /integrations.",
  })
  status!: (typeof INSTAGRAM_OAUTH_PENDING_STATUSES)[number];

  @ApiProperty({
    type: [InstagramOAuthPageOptionDto],
    description: "Empty while status is `awaiting_facebook`.",
  })
  pages!: InstagramOAuthPageOptionDto[];

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional({
    description: "Present when status is `failed`.",
  })
  error?: string | null;
}

/** @deprecated Use InstagramOAuthPendingPollResponseDto */
export class InstagramOAuthPendingPagesResponseDto extends InstagramOAuthPendingPollResponseDto {}

export class ConfirmInstagramIntegrationRequestDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({
    example: "17841400000000000",
    description: "Facebook Page id chosen from the pending session pages list.",
  })
  @IsString()
  @IsNotEmpty()
  pageId!: string;
}

export class ConfirmInstagramIntegrationResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty()
  id!: number;

  @ApiProperty()
  pageId!: string;

  @ApiProperty()
  pageName!: string;

  @ApiProperty()
  instagramAccountId!: string;

  @ApiProperty()
  tokenConnectedAt!: string;

  @ApiProperty({ example: "active" })
  tokenStatus!: string;

  @ApiProperty({
    description:
      "Background job id that syncs conversations + messages for the last 7 days. " +
      "Poll GET /api/instagram/synchronizations/:id for progress.",
  })
  synchronizationId!: number;
}
