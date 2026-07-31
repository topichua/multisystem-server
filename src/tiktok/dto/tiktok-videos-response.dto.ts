import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TikTokVideoDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  videoDescription?: string;

  @ApiPropertyOptional({ description: "Unix timestamp (seconds)" })
  createTime?: number;

  @ApiPropertyOptional({ description: "ISO 8601 from createTime" })
  createTimeIso?: string;

  @ApiPropertyOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional()
  shareUrl?: string;

  @ApiPropertyOptional()
  duration?: number;

  @ApiPropertyOptional()
  likeCount?: number;

  @ApiPropertyOptional()
  commentCount?: number;

  @ApiPropertyOptional()
  shareCount?: number;

  @ApiPropertyOptional()
  viewCount?: number;
}

export class TikTokVideosListResponseDto {
  @ApiProperty({ type: () => [TikTokVideoDto] })
  data: TikTokVideoDto[];

  @ApiPropertyOptional({
    description: "Cursor for the next page (pass as `cursor` query)",
  })
  cursor?: number;

  @ApiPropertyOptional()
  hasMore?: boolean;

  @ApiProperty({
    description: "`tiktok_integrations.id` used for this request",
  })
  integrationId: number;
}
