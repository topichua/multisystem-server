import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationSource } from '../../../database/entities';

export class ConversationParticipantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  profilePic: string;
}

export class ConversationRowDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  instUpdatedAt: Date;

  @ApiProperty({
    description:
      'True when the latest message is from the participant (not your account) and is newer than `read_at` on this conversation, or you have never opened the thread (`read_at` null). Updated when you GET conversation messages.',
  })
  isUnread: boolean;

  @ApiProperty({ enum: ConversationSource })
  source: ConversationSource;

  @ApiPropertyOptional({ nullable: true })
  groupId: number | null;

  @ApiProperty()
  lastMessage: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'True when the latest message was sent by my connected account; false when sent by participant; null when unknown.',
  })
  isLastMessageFromMe: boolean | null;

  @ApiPropertyOptional({
    type: ConversationParticipantDto,
    nullable: true,
    description: 'Profile of the participant opposite to the current account in this conversation.',
  })
  participant: ConversationParticipantDto | null;
}

export class ConversationsListResponseDto {
  @ApiProperty({ type: [ConversationRowDto] })
  items: ConversationRowDto[];
}
