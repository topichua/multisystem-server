import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";
import { ConversationFollowUpStatus } from "./conversation-follow-up-status.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity("conversation_follow_ups")
@Index("IDX_conversation_follow_ups_due", ["status", "scheduledAt"])
@Index("IDX_conversation_follow_ups_workspace_conversation", [
  "workspaceId",
  "conversationId",
])
export class ConversationFollowUp {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "conversation_id", type: "int" })
  conversationId: number;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "workspace_id", referencedColumnName: "workspaceId" },
    { name: "conversation_id", referencedColumnName: "id" },
  ])
  conversation: Conversation;

  @Column({
    type: "enum",
    enum: ConversationFollowUpStatus,
    enumName: "conversation_follow_up_status_enum",
    default: ConversationFollowUpStatus.pending,
  })
  status: ConversationFollowUpStatus;

  /** When the follow-up message should be sent. */
  @Column({ name: "scheduled_at", type: "timestamptz" })
  scheduledAt: Date;

  @Column({ name: "message", type: "text" })
  message: string;

  /** Optional chat/order template used to draft the message. */
  @Column({ name: "template_id", type: "int", nullable: true })
  templateId: number | null;

  /**
   * When true (default), an inbound customer reply cancels this follow-up
   * and emits `follow_up_declined`.
   */
  @Column({ name: "cancel_on_reply", type: "boolean", default: true })
  cancelOnReply: boolean;

  /** Conversation group at create time (for UI / optional restore). */
  @Column({ name: "previous_group_id", type: "int", nullable: true })
  previousGroupId: number | null;

  @Column({ name: "created_by_id", type: "int", nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User | null;

  @Column({ name: "updated_by_id", type: "int", nullable: true })
  updatedById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_id" })
  updatedBy: User | null;

  @Column({ name: "cancel_reason", type: "varchar", length: 64, nullable: true })
  cancelReason: string | null;

  @Column({ name: "error_code", type: "varchar", length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "sent_at", type: "timestamptz", nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
