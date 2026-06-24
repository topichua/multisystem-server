import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InstagramMediaPagingDto } from "./instagram-media-response.dto";

export class InstagramCommentAuthorDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional({
    description: "Full display name from `instagram_users` / Graph.",
  })
  name?: string;

  @ApiPropertyOptional({
    description: "Profile picture URL from `instagram_users` / Graph.",
  })
  profilePic?: string;
}

export class InstagramCommentDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  text?: string;

  @ApiPropertyOptional({ description: "ISO 8601 from Graph" })
  timestamp?: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  like_count?: number;

  @ApiPropertyOptional()
  hidden?: boolean;

  @ApiPropertyOptional({ type: () => InstagramCommentAuthorDto })
  from?: InstagramCommentAuthorDto;

  @ApiPropertyOptional({
    description:
      "Number of replies on this comment (from Graph `replies.summary.total_count`).",
  })
  reply_count?: number;

  @ApiPropertyOptional({
    description: "Whether this comment has one or more replies.",
  })
  has_replies?: boolean;

  @ApiPropertyOptional({
    type: () => [InstagramCommentDto],
    description:
      "Embedded reply objects (only when `include_replies=true` on GET .../comments).",
  })
  replies?: InstagramCommentDto[];
}

export class InstagramPostCommentsListResponseDto {
  @ApiProperty({ type: () => [InstagramCommentDto] })
  data: InstagramCommentDto[];

  @ApiPropertyOptional({ type: () => InstagramMediaPagingDto })
  paging?: InstagramMediaPagingDto;
}
