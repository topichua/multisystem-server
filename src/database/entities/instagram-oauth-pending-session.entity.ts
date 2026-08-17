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

export const INSTAGRAM_OAUTH_PENDING_STATUSES = [
  "awaiting_facebook",
  "awaiting_instagram",
  "select_page",
  "connected",
  "failed",
] as const;

export type InstagramOAuthPendingStatus =
  (typeof INSTAGRAM_OAUTH_PENDING_STATUSES)[number];

export type InstagramOAuthPendingPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramAccountId: string;
};

/**
 * Correlation session created before Facebook Login.
 * Client polls until status becomes `select_page`, then confirms a Page.
 */
@Entity("instagram_oauth_pending_sessions")
@Index("IDX_instagram_oauth_pending_sessions_workspace_id", ["workspaceId"])
@Index("IDX_instagram_oauth_pending_sessions_user_id", ["userId"])
@Index("IDX_instagram_oauth_pending_sessions_expires_at", ["expiresAt"])
export class InstagramOAuthPendingSession {
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
    default: "awaiting_facebook",
  })
  status: InstagramOAuthPendingStatus;

  /** `facebook` — Facebook Login; `instagram` — Instagram Login. */
  @Column({ name: "oauth_provider", type: "varchar", length: 32, default: "facebook" })
  oauthProvider: "facebook" | "instagram";

  /** Long-lived Facebook / Instagram user token — set after OAuth callback. */
  @Column({ name: "user_access_token", type: "text", nullable: true })
  userAccessToken: string | null;

  /**
   * Snapshot of Facebook Pages with Instagram Business accounts
   * (includes page access tokens for confirm). Empty until Login completes.
   */
  @Column({ name: "pages", type: "jsonb", default: () => "'[]'" })
  pages: InstagramOAuthPendingPage[];

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
