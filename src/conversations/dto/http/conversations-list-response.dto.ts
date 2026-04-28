import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationSource } from '../../../database/entities';

export class ConversationRowDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ description: 'Typically the Facebook Page id used for the IG inbox.' })
  externalSourceId: string;

  @ApiProperty({ description: 'Instagram Graph conversation id (use with messages API).' })
  externalId: string;

  @ApiProperty()
  instUpdatedAt: Date;

  @ApiPropertyOptional()
  isUnread: boolean;

  @ApiProperty({ description: 'Instagram user id for the other participant in the thread (PSID / IGSID).' })
  participantId: string;

  @ApiProperty({ enum: ConversationSource })
  source: ConversationSource;

  @ApiPropertyOptional({ nullable: true })
  groupId: number | null;

  @ApiProperty()
  lastMessage: string;
}

export class ConversationsListResponseDto {
  @ApiProperty({ type: [ConversationRowDto] })
  items: ConversationRowDto[];
}
