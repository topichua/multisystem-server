import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Workspace } from "./workspace.entity";

@Entity("instagram_users")
@Index("IDX_instagram_users_workspace_username", ["workspaceId", "username"])
export class InstagramUser {
  @PrimaryColumn({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  /** Instagram user id (PSID / IGSID from Graph). */
  @PrimaryColumn({ name: "id", type: "varchar", length: 255 })
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "username", type: "varchar", length: 255 })
  username: string;

  @Column({ name: "profile_pic", type: "text" })
  profilePic: string;

  @Column({ name: "synced_at", type: "timestamptz", nullable: true })
  syncedAt: Date | null;

  @Column({ name: "last_seen", type: "timestamptz", nullable: true })
  lastSeen: Date | null;
}
