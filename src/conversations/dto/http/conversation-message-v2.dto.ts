import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConversationMessageReactionDto } from "./conversation-message-reaction.dto";

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
  
  attachments: Array<{type: 'image' | 'video' | 'audio' | 'file'; key: string; url: string; at: Date; name: string; meta: any}>;

  systemUpdatedAt: Date;
}