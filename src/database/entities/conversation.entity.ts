import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { ConversationSource } from "./conversation-source.enum";
import { ConversationGroup } from "./conversation-group.entity";
import { Workspace } from "./workspace.entity";
import { WorkspaceMember } from "./workspace-member.entity";

@Entity("conversations")
@Unique("UQ_conversations_workspace_external_id", ["workspaceId", "externalId"])
@Index("IDX_conversations_group_id", ["groupId"])
@Index("IDX_conversations_responsible_member_id", ["responsibleMemberId"])
@Index("IDX_conversations_workspace_id", ["workspaceId"])
@Index("IDX_conversations_workspace_created_at", ["workspaceId", "createdAt"])
@Check(`"source" IN (1, 2)`)
export class Conversation {
  @PrimaryColumn({ name: "workspace_id", type: "int" })
  workspaceId: number;

  /** Per-workspace sequential conversation number (starts at 1). */
  @PrimaryColumn({ name: "id", type: "int" })
  id: number;

  @ManyToOne(() => Workspace, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "external_source_id", type: "varchar", length: 255 })
  externalSourceId: string;

  @Column({ name: "external_id", type: "varchar", length: 255 })
  externalId: string;

  /** When the conversation row was first created (not last activity). */
  @Column({
    name: "created_at",
    type: "timestamptz",
    default: () => "now()",
  })
  createdAt: Date;

  @Column({ name: "inst_updated_at", type: "timestamptz" })
  instUpdatedAt: Date;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt: Date | null;

  /** Instagram participant user id (PSID / IGSID); stored as string (can exceed 32-bit int). */
  @Column({ name: "participant_id", type: "varchar", length: 255 })
  participantId: string;

  @Column({ name: "source", type: "smallint" })
  source: ConversationSource;

  @Column({ name: "group_id", type: "int", nullable: true })
  groupId: number | null;

  @ManyToOne(() => ConversationGroup, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "group_id" })
  group: ConversationGroup | null;

  @Column({ name: "responsible_member_id", type: "int", nullable: true })
  responsibleMemberId: number | null;

  @ManyToOne(() => WorkspaceMember, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "responsible_member_id" })
  responsibleMember: WorkspaceMember | null;

  @Column({
    name: "responsible_member_set_at",
    type: "timestamptz",
    nullable: true,
  })
  responsibleMemberSetAt: Date | null;
}
