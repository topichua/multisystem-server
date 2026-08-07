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
import { Workspace } from "./workspace.entity";
import { WorkspaceMember } from "./workspace-member.entity";

@Entity({ name: "chat_auto_distribution_logs" })
@Index("IDX_chat_auto_distribution_logs_workspace_id", ["workspaceId"])
@Index("IDX_chat_auto_distribution_logs_workspace_created", [
  "workspaceId",
  "createdAt",
])
@Index("IDX_chat_auto_distribution_logs_channel", [
  "workspaceId",
  "integrationType",
  "integrationId",
])
@Index("IDX_chat_auto_distribution_logs_member_id", ["memberId"])
export class ChatAutoDistributionLog {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "integration_type", type: "varchar", length: 32 })
  integrationType: string;

  @Column({ name: "integration_id", type: "int" })
  integrationId: number;

  @Column({ name: "conversation_id", type: "int" })
  conversationId: number;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "workspace_id", referencedColumnName: "workspaceId" },
    { name: "conversation_id", referencedColumnName: "id" },
  ])
  conversation: Conversation;

  @Column({ name: "member_id", type: "int" })
  memberId: number;

  @ManyToOne(() => WorkspaceMember, { onDelete: "CASCADE" })
  @JoinColumn({ name: "member_id" })
  member: WorkspaceMember;

  @Column({ name: "user_id", type: "int" })
  userId: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
