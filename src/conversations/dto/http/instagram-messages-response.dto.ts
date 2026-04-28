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

  @ApiPropertyOptional({
    description:
      'Present when requesting `conversation{id}` on the message node (fallback resolution)',
  })
  conversation?: { id?: string };

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

  @ApiPropertyOptional({
    description:
      'When the message was last edited on Instagram (if known), ISO 8601',
  })
  edited_at?: string;

  @ApiPropertyOptional({
    description: 'When this message was marked as read in this system, ISO 8601',
  })
  read_at?: string;

  @ApiPropertyOptional({
    description: 'When this server last stored/updated the message row, ISO 8601',
  })
  system_updated_at?: string;

  @ApiPropertyOptional({
    description:
      'Internal DB id of the message this message replies to (resolved from webhook reply_to.mid when available).',
  })
  reply_to_id?: number;
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

  @ApiPropertyOptional({
    description: 'Paging: current page number.',
  })
  page?: number;

  @ApiPropertyOptional({
    description: 'Paging: page size.',
  })
  page_size?: number;

  @ApiPropertyOptional({
    description: 'Paging: total messages matching the filter.',
  })
  total?: number;

  @ApiPropertyOptional({
    description: 'Paging: total number of pages.',
  })
  total_pages?: number;

  @ApiPropertyOptional({
    description: 'Paging: whether there is a next page.',
  })
  has_next?: boolean;

  @ApiPropertyOptional({
    description: 'Paging: whether there is a previous page.',
  })
  has_previous?: boolean;
}

export class InstagramMessagesResponseDto {
  @ApiProperty({ type: () => [InstagramMessageDto] })
  data: InstagramMessageDto[];

  @ApiPropertyOptional({ type: () => InstagramMessagesPagingDto })
  paging?: InstagramMessagesPagingDto;
}
