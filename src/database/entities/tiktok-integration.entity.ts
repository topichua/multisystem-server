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
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

export const TIKTOK_INTEGRATION_PROVIDER = "TIKTOK" as const;

export const TIKTOK_INTEGRATION_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
] as const;

export type TikTokIntegrationStatus =
  (typeof TIKTOK_INTEGRATION_STATUSES)[number];

@Entity("tiktok_integrations")
@Index("IDX_tiktok_integrations_owner_id", ["ownerId"])
@Index("IDX_tiktok_integrations_workspace_id", ["workspaceId"])
@Index("UQ_tiktok_integrations_workspace_open_id", ["workspaceId", "openId"], {
  unique: true,
})
export class TikTokIntegration {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({
    name: "provider",
    type: "varchar",
    length: 32,
    default: TIKTOK_INTEGRATION_PROVIDER,
  })
  provider: typeof TIKTOK_INTEGRATION_PROVIDER;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  /** TikTok user `open_id` from the OAuth token response. */
  @Column({ name: "open_id", type: "varchar", length: 255 })
  openId: string;

  /** AES-GCM encrypted access token (never returned to the client). */
  @Column({ name: "access_token_encrypted", type: "text" })
  accessTokenEncrypted: string;

  /** AES-GCM encrypted refresh token (never returned to the client). */
  @Column({ name: "refresh_token_encrypted", type: "text", nullable: true })
  refreshTokenEncrypted: string | null;

  /** Space-separated scopes granted by TikTok. */
  @Column({ name: "scopes", type: "varchar", length: 512, nullable: true })
  scopes: string | null;

  @Column({
    name: "access_token_expires_at",
    type: "timestamptz",
    nullable: true,
  })
  accessTokenExpiresAt: Date | null;

  @Column({
    name: "refresh_token_expires_at",
    type: "timestamptz",
    nullable: true,
  })
  refreshTokenExpiresAt: Date | null;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: "CONNECTED",
  })
  status: TikTokIntegrationStatus;

  @Column({
    name: "display_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  displayName: string | null;

  @Column({
    name: "username",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  username: string | null;

  @Column({
    name: "avatar_url",
    type: "text",
    nullable: true,
  })
  avatarUrl: string | null;

  @Column({ name: "owner_id", type: "int" })
  ownerId: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_id" })
  owner: User;

  @ManyToOne(() => Workspace, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
