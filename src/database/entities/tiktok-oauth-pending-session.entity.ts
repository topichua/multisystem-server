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

export const TIKTOK_OAUTH_PENDING_STATUSES = [
  "awaiting_tiktok",
  "connected",
  "failed",
] as const;

export type TikTokOAuthPendingStatus =
  (typeof TIKTOK_OAUTH_PENDING_STATUSES)[number];

/**
 * Correlation session created before TikTok Login Kit.
 * Client polls until status becomes `connected` (or `failed`).
 * Unlike Instagram, the integration row is written in the provider callback
 * (no multi-account page picker).
 */
@Entity("tiktok_oauth_pending_sessions")
@Index("IDX_tiktok_oauth_pending_sessions_workspace_id", ["workspaceId"])
@Index("IDX_tiktok_oauth_pending_sessions_user_id", ["userId"])
@Index("IDX_tiktok_oauth_pending_sessions_expires_at", ["expiresAt"])
export class TikTokOAuthPendingSession {
  @PrimaryGeneratedColumn("uuid", { name: "id" })
  id: string;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "user_id", type: "int" })
  userId: number;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: "awaiting_tiktok",
  })
  status: TikTokOAuthPendingStatus;

  /** Set after a successful callback when an integration row was upserted. */
  @Column({ name: "integration_id", type: "int", nullable: true })
  integrationId: number | null;

  /**
   * PKCE code_verifier generated at OAuth start.
   * Required by TikTok authorize (`code_challenge`) and token exchange.
   */
  @Column({ name: "code_verifier", type: "varchar", length: 128, nullable: true })
  codeVerifier: string | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
