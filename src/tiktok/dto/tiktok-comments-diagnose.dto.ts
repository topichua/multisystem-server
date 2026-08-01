import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TikTokCommentsDiagnoseAttemptDto {
  @ApiProperty({ example: "GET" })
  method: string;

  @ApiProperty()
  url: string;

  @ApiPropertyOptional()
  httpStatus?: number;

  @ApiPropertyOptional({ description: "Parsed TikTok JSON body (error or success)." })
  responseJson?: unknown;

  @ApiPropertyOptional()
  errorCode?: string;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional()
  logId?: string;

  @ApiProperty({ description: "Whether this attempt returned TikTok `error.code === ok`." })
  ok: boolean;
}

export class TikTokCommentsDiagnoseIntegrationDto {
  @ApiProperty()
  id: number;

  @ApiPropertyOptional({ nullable: true })
  openId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  scopes?: string | null;

  @ApiPropertyOptional({
    description: "Whether stored scopes include `comment.list`.",
  })
  hasCommentListScope?: boolean;

  @ApiPropertyOptional({ nullable: true })
  accessTokenExpiresAt?: string | null;

  @ApiPropertyOptional({
    description: "True when access token is missing expiry or expires within 5 minutes.",
  })
  accessTokenNearExpiry?: boolean;

  @ApiProperty()
  status: string;
}

export class TikTokCommentsDiagnoseResponseDto {
  @ApiProperty({
    description: "High-level machine reason for the failure (or `ok` when comments listed).",
    examples: [
      "ok",
      "scope_not_authorized",
      "scope_missing_on_token",
      "access_token_invalid",
      "invalid_params",
      "tiktok_api_error",
      "network_error",
    ],
  })
  reason: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({
    description: "Actionable fix based on TikTok error / local checks.",
  })
  fix?: string;

  @ApiProperty()
  videoId: string;

  @ApiProperty({ type: TikTokCommentsDiagnoseIntegrationDto })
  integration: TikTokCommentsDiagnoseIntegrationDto;

  @ApiProperty({
    description: "Scopes currently configured for OAuth reconnect (`TIKTOK_OAUTH_SCOPES`).",
  })
  oauthScopesConfigured: string;

  @ApiProperty({ type: [TikTokCommentsDiagnoseAttemptDto] })
  attempts: TikTokCommentsDiagnoseAttemptDto[];

  @ApiPropertyOptional({
    description: "Present when at least one attempt succeeded.",
    type: "array",
    items: { type: "object" },
  })
  commentsSample?: unknown[];
}
