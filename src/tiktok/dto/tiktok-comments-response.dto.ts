import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TikTokCommentDto {
  @ApiProperty({ description: "TikTok comment id" })
  id: string;

  @ApiPropertyOptional({ description: "Video id this comment belongs to" })
  videoId?: string;

  @ApiPropertyOptional()
  text?: string;

  @ApiPropertyOptional({
    description: "Unix timestamp (seconds) when the comment was created",
  })
  createTime?: number;

  @ApiPropertyOptional({ description: "ISO 8601 from createTime" })
  createTimeIso?: string;

  @ApiPropertyOptional()
  likeCount?: number;

  @ApiPropertyOptional()
  replyCount?: number;

  @ApiPropertyOptional({
    description: "Parent comment id when this is a reply",
  })
  parentCommentId?: string;

  @ApiPropertyOptional({
    description: "Display name of the commenter when TikTok returns it",
  })
  displayName?: string;
}

export class TikTokCommentsListResponseDto {
  @ApiProperty({ type: () => [TikTokCommentDto] })
  data: TikTokCommentDto[];

  @ApiPropertyOptional({
    description: "Cursor for the next page (pass as `cursor` query)",
  })
  cursor?: number;

  @ApiPropertyOptional()
  hasMore?: boolean;

  @ApiProperty({
    description: "TikTok video id these comments belong to",
  })
  videoId: string;

  @ApiProperty({
    description: "`tiktok_integrations.id` used for this request",
  })
  integrationId: number;
}
