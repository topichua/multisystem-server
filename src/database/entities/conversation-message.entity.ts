import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  /**
   * When the message was last edited on Instagram (e.g. from a `message_edit` webhook
   * or when we learn of an edit). Null if never edited in our data.
   */
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  /**
   * Last time this application wrote/updated the row in the database.
   */
  @UpdateDateColumn({ name: 'system_updated_at', type: 'timestamptz' })
  systemUpdatedAt: Date;

  @Column({ name: 'sender_id', type: 'varchar', length: 255 })
  senderId: string;

  @Column({ name: 'receiver_id', type: 'varchar', length: 255 })
  receiverId: string;
}
