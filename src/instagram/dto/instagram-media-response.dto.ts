import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InstagramMediaChildDto {
  @ApiPropertyOptional({ description: "Child media id (carousel item)." })
  id?: string;

  @ApiPropertyOptional({ enum: ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"] })
  media_type?: string;

  @ApiPropertyOptional({ description: "Direct media URL when available." })
  media_url?: string;

  @ApiPropertyOptional()
  thumbnail_url?: string;
}

export class InstagramMediaItemDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  caption?: string;

  @ApiPropertyOptional({ enum: ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"] })
  media_type?: string;

  @ApiPropertyOptional()
  media_url?: string;

  @ApiPropertyOptional()
  permalink?: string;

  @ApiPropertyOptional()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: "ISO 8601 from Graph" })
  timestamp?: string;

  @ApiPropertyOptional({
    description:
      "Like count from Graph. Omitted when the creator has hidden like counts or the field is unavailable.",
  })
  like_count?: number;

  @ApiPropertyOptional({
    description:
      "Comment count from Graph. Omitted when the creator has hidden comment counts or the field is unavailable.",
  })
  comments_count?: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Hashtags parsed from the caption (text after #, without the #). Graph does not expose a separate hashtag list.",
  })
  tags?: string[];

  @ApiPropertyOptional({ type: () => [InstagramMediaChildDto] })
  children?: InstagramMediaChildDto[];
}

export class InstagramMediaPagingCursorsDto {
  @ApiPropertyOptional({
    description: "Pass as query `before` to load the previous page.",
  })
  before?: string;

  @ApiPropertyOptional({
    description: "Pass as query `after` to load the next page.",
  })
  after?: string;
}

export class InstagramMediaPagingDto {
  @ApiPropertyOptional({ type: () => InstagramMediaPagingCursorsDto })
  cursors?: InstagramMediaPagingCursorsDto;

  @ApiPropertyOptional({
    description: "Whether Graph returned a next page for this result set.",
  })
  has_next?: boolean;

  @ApiPropertyOptional({
    description: "Whether Graph returned a previous page for this result set.",
  })
  has_previous?: boolean;
}

export class InstagramMediaListResponseDto {
  @ApiProperty({ type: () => [InstagramMediaItemDto] })
  data: InstagramMediaItemDto[];

  @ApiPropertyOptional({ type: () => InstagramMediaPagingDto })
  paging?: InstagramMediaPagingDto;
}
