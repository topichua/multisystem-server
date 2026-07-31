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
import { Workspace } from "./workspace.entity";

/**
 * One-time OAuth `state` for TikTok connect (TTL ~10 minutes).
 * Rejected when expired or when `usedAt` is already set.
 */
@Entity("tiktok_oauth_states")
@Index("UQ_tiktok_oauth_states_state", ["state"], { unique: true })
@Index("IDX_tiktok_oauth_states_expires_at", ["expiresAt"])
@Index("IDX_tiktok_oauth_states_workspace_id", ["workspaceId"])
export class TikTokOAuthState {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "state", type: "varchar", length: 128 })
  state: string;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "user_id", type: "int" })
  userId: number;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
