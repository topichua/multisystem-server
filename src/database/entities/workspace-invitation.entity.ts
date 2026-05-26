import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";
import { WorkspaceInvitationStatus } from "./workspace-invitation-status.enum";
import { WorkspaceRole } from "./workspace-role.entity";
import { Workspace } from "./workspace.entity";

@Entity("workspace_invitations")
@Index("IDX_workspace_invitations_workspace_id", ["workspaceId"])
@Index("IDX_workspace_invitations_email", ["email"])
export class WorkspaceInvitation {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "email", type: "varchar", length: 255 })
  email: string;

  @Column({ name: "role_id", type: "int" })
  roleId: number;

  @ManyToOne(() => WorkspaceRole, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "role_id" })
  role: WorkspaceRole;

  @Column({ name: "invited_by_user_id", type: "int" })
  invitedByUserId: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invited_by_user_id" })
  invitedBy: User;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: WorkspaceInvitationStatus.PENDING,
  })
  status: WorkspaceInvitationStatus;

  @Column({ name: "token_hash", type: "text", nullable: true })
  tokenHash: string | null;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  @Column({ name: "accepted_at", type: "timestamptz", nullable: true })
  acceptedAt: Date | null;

  @Column({ name: "accepted_user_id", type: "int", nullable: true })
  acceptedUserId: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
