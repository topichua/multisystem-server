import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { User } from "./user.entity";
import { WorkspaceMemberStatus } from "./workspace-member-status.enum";
import { WorkspaceRole } from "./workspace-role.entity";
import { Workspace } from "./workspace.entity";

@Entity("workspace_members")
@Unique("UQ_workspace_members_workspace_user", ["workspaceId", "userId"])
@Index("IDX_workspace_members_workspace_id", ["workspaceId"])
@Index("IDX_workspace_members_user_id", ["userId"])
export class WorkspaceMember {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "user_id", type: "int" })
  userId: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "role_id", type: "int" })
  roleId: number;

  @ManyToOne(() => WorkspaceRole, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "role_id" })
  role: WorkspaceRole;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: WorkspaceMemberStatus.ACTIVE,
  })
  status: WorkspaceMemberStatus;

  @Column({ name: "invited_by_user_id", type: "int", nullable: true })
  invitedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "invited_by_user_id" })
  invitedBy: User | null;

  @Column({ name: "joined_at", type: "timestamptz" })
  joinedAt: Date;

  @Column({ name: "can_be_assigned_to_chat", type: "boolean", default: true })
  canBeAssignedToChat: boolean;

  /** Fallback avatar color when the user has no `avatar_src`. */
  @Column({ name: "color", type: "varchar", length: 64, nullable: true })
  color: string | null;

  /**
   * Optional limit on which integration rows apply (workspace may have many per type).
   * Omit/null id lists = all instances of that type in the workspace.
   */
  @Column({ name: "integration_scopes", type: "jsonb", nullable: true })
  integrationScopes: {
    instagram_integration_ids?: number[] | null;
    telegram_integration_ids?: number[] | null;
  } | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
