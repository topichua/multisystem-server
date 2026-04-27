import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InstagramMessageActorDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  username?: string;
}

export class InstagramMessageImageDataDto {
  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional({ description: 'Meta docs typo variant' })
  medial_url?: string;

  @ApiPropertyOptional()
  preview_url?: string;

  @ApiPropertyOptional()
  animated_gif_url?: string;

  @ApiPropertyOptional()
  animated_gif_preview_url?: string;

  @ApiPropertyOptional()
  render_as_sticker?: boolean;

  @ApiPropertyOptional()
  width?: number;

  @ApiPropertyOptional()
  height?: number;
}

export class InstagramMessageVideoDataDto {
  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  preview_url?: string;
}

export class InstagramMessageAttachmentDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  mime_type?: string;

  @ApiPropertyOptional()
  size?: number;

  @ApiPropertyOptional({ description: 'Generic file / audio CDN URL' })
  file_url?: string;

  @ApiPropertyOptional({ type: () => InstagramMessageImageDataDto })
  image_data?: InstagramMessageImageDataDto;

  @ApiPropertyOptional({ type: () => InstagramMessageVideoDataDto })
  video_data?: InstagramMessageVideoDataDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  generic_template?: Record<string, unknown>;
}

export class InstagramMessageAttachmentsDto {
  @ApiPropertyOptional({ type: () => [InstagramMessageAttachmentDto] })
  data?: InstagramMessageAttachmentDto[];
}

export class InstagramMessageShareDataDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'e.g. post, reel, ig_post, ig_reel' })
  type?: string;

  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  link?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  template?: Record<string, unknown>;
}

export class InstagramMessageSharesDto {
  @ApiPropertyOptional({ type: () => [InstagramMessageShareDataDto] })
  data?: InstagramMessageShareDataDto[];
}

export class InstagramMessageStoryNodeDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'CDN preview URL' })
  link?: string;
}

/** Graph returns `story.mention` or `story.reply`, not top-level id/link. */
export class InstagramMessageStoryDto {
  @ApiPropertyOptional({ type: () => InstagramMessageStoryNodeDto })
  mention?: InstagramMessageStoryNodeDto;

  @ApiPropertyOptional({ type: () => InstagramMessageStoryNodeDto })
  reply?: InstagramMessageStoryNodeDto;
}

export class InstagramMessageReactionUserDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  username?: string;
}

export class InstagramMessageReactionItemDto {
  @ApiPropertyOptional()
  reaction?: string;

  @ApiPropertyOptional({ type: () => [InstagramMessageReactionUserDto] })
  users?: InstagramMessageReactionUserDto[];
}

export class InstagramMessageReactionsDto {
  @ApiPropertyOptional({ type: () => [InstagramMessageReactionItemDto] })
  data?: InstagramMessageReactionItemDto[];
}

export class InstagramMessageTagDto {
  @ApiPropertyOptional()
  name?: string;
}

export class InstagramMessageTagsDto {
  @ApiPropertyOptional({ type: () => [InstagramMessageTagDto] })
  data?: InstagramMessageTagDto[];
}

export class InstagramMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  created_time: string;

  @ApiPropertyOptional({ type: () => InstagramMessageActorDto })
  from?: InstagramMessageActorDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  to?: { data?: InstagramMessageActorDto[] };

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({
    description: 'True when the message type is not supported for display via API',
  })
  is_unsupported?: boolean;

  @ApiPropertyOptional({ type: () => InstagramMessageAttachmentsDto })
  attachments?: InstagramMessageAttachmentsDto;

  @ApiPropertyOptional({ type: () => InstagramMessageSharesDto })
  shares?: InstagramMessageSharesDto;

  @ApiPropertyOptional({ type: () => InstagramMessageStoryDto })
  story?: InstagramMessageStoryDto;

  @ApiPropertyOptional({ type: () => InstagramMessageReactionsDto })
  reactions?: InstagramMessageReactionsDto;

  @ApiPropertyOptional({ type: () => InstagramMessageTagsDto })
  tags?: InstagramMessageTagsDto;
}

export class InstagramMessagesPagingCursorsDto {
  @ApiPropertyOptional()
  before?: string;

  @ApiPropertyOptional()
  after?: string;
}

export class InstagramMessagesPagingDto {
  @ApiPropertyOptional({ type: () => InstagramMessagesPagingCursorsDto })
  cursors?: InstagramMessagesPagingCursorsDto;

  @ApiPropertyOptional()
  next?: string;

  @ApiPropertyOptional()
  previous?: string;
}

export class InstagramMessagesResponseDto {
  @ApiProperty({ type: () => [InstagramMessageDto] })
  data: InstagramMessageDto[];

  @ApiPropertyOptional({ type: () => InstagramMessagesPagingDto })
  paging?: InstagramMessagesPagingDto;
}
