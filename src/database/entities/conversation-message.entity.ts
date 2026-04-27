import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('conversation_messages')
@Index('IDX_conversation_messages_conversation_id', ['conversationId'])
export class ConversationMessage {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'conversation_id', type: 'int' })
  conversationId: number;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'instagram_json', type: 'text' })
  instagramJson: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'sender_id', type: 'varchar', length: 255 })
  senderId: string;

  @Column({ name: 'receiver_id', type: 'varchar', length: 255 })
  receiverId: string;
}
