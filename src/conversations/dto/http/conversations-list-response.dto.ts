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

  @ApiPropertyOptional({ nullable: true })
  readAt: Date | null;

  @ApiProperty({ description: 'Instagram-scoped id for the other participant in the thread.' })
  participantId: string;

  @ApiProperty({ enum: ConversationSource })
  source: ConversationSource;

  @ApiPropertyOptional({ nullable: true })
  groupId: number | null;
}

export class ConversationsListResponseDto {
  @ApiProperty({ type: [ConversationRowDto] })
  items: ConversationRowDto[];
}
