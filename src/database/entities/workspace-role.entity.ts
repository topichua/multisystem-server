import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Workspace } from "./workspace.entity";

@Entity("workspace_roles")
@Unique("UQ_workspace_roles_workspace_slug", ["workspaceId", "slug"])
@Index("IDX_workspace_roles_workspace_id", ["workspaceId"])
export class WorkspaceRole {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "slug", type: "varchar", length: 64 })
  slug: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null;

  @Column({ name: "color", type: "varchar", length: 64, nullable: true })
  color: string | null;

  /** Boolean permission keys from the static catalog in `workspace-access/permissions`. */
  @Column({ name: "permissions", type: "jsonb" })
  permissions: string[];

  /** Option permission values, e.g. `{ "orders.visibility": "mine" }`. */
  @Column({
    name: "permission_options",
    type: "jsonb",
    default: () => "'{}'",
  })
  permissionOptions: Record<string, string>;

  /** Selected values for option permissions, e.g. `{ "conversations.sources": ["instagram"] }`. */
  @Column({
    name: "permission_option_lists",
    type: "jsonb",
    default: () => "'{}'",
  })
  permissionOptionLists: Record<string, string[]>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
