import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Workspace } from "./workspace.entity";

@Entity("conversation_groups")
@Index("IDX_conversation_groups_workspace_id", ["workspaceId"])
export class ConversationGroup {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null;

  @Column({ name: "color", type: "varchar", length: 64, nullable: true })
  color: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "created_by_id", type: "int", nullable: true })
  createdById: number | null;

  /** Display order within the workspace (SQL `order` is reserved). */
  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;
}
