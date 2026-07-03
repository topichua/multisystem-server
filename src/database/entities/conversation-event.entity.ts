import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";
import { User } from "./user.entity";

@Entity("conversation_events")
@Index("IDX_conversation_events_conversation_id", ["conversationId"])
export class ConversationEvent {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "conversation_id", type: "int" })
  conversationId: number;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation;

  @Column({ name: "type", type: "varchar", length: 64 })
  type: string;

  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "actor_id" })
  actor: User | null;

  @Column({ name: "payload", type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
