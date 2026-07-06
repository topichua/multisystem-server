import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConversationMessageReactionDto } from "./conversation-message-reaction.dto";
import { ConversationMessageAttachmentsDto } from "./conversation-message-attachment.dto";

export class ConversationMessageV2Dto {
  @ApiProperty()
  id: string;

  conversationId: number;

  @ApiProperty()
  createdAt: Date;

  editedAt: Date | null;

  readAt: Date | null;

  deletedAt: Date | null;

  message: string;

  senderId: string;

  receiverId: string;

  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'instagram_comment'| 'instagram_post' | 'instagram_reels' | 'instagram_story';

  repliedToMessage: ConversationMessageV2Dto;

  @ApiProperty({ type: () => [ConversationMessageReactionDto] })
  reactions: ConversationMessageReactionDto[];
  
  @ApiProperty({ type: () => ConversationMessageAttachmentsDto })
  attachments: ConversationMessageAttachmentsDto;

  systemUpdatedAt: Date;
}