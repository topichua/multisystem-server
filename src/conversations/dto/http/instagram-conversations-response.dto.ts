import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InstagramConversationParticipantDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  profile_pic?: string;
}

export class InstagramConversationParticipantsDto {
  @ApiProperty({ type: () => [InstagramConversationParticipantDto] })
  data: InstagramConversationParticipantDto[];
}

export class InstagramConversationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  updated_time: string;

  @ApiProperty({ type: () => InstagramConversationParticipantsDto })
  participants: InstagramConversationParticipantsDto;

  @ApiPropertyOptional({ description: 'Unread message count (when returned by Graph API)' })
  unread_count?: number;

  @ApiPropertyOptional({ description: 'Total message count (when returned by Graph API)' })
  message_count?: number;
}

export class InstagramPagingCursorsDto {
  @ApiPropertyOptional()
  before?: string;

  @ApiPropertyOptional()
  after?: string;
}

export class InstagramPagingDto {
  @ApiProperty({ type: () => InstagramPagingCursorsDto, required: false })
  cursors?: InstagramPagingCursorsDto;

  @ApiPropertyOptional()
  next?: string;
}

export class InstagramConversationsResponseDto {
  @ApiProperty({ type: () => [InstagramConversationDto] })
  data: InstagramConversationDto[];

  @ApiProperty({ type: () => InstagramPagingDto, required: false })
  paging?: InstagramPagingDto;
}
