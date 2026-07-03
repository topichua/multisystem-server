import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Workspace } from "./workspace.entity";

@Entity("telegram_users")
@Index("IDX_telegram_users_workspace_username", ["workspaceId", "username"])
export class TelegramUser {
  @PrimaryColumn({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  /** Telegram user id (matches `conversations.participant_id`). */
  @PrimaryColumn({ name: "id", type: "varchar", length: 32 })
  id: string;

  @Column({ name: "first_name", type: "varchar", length: 255, default: "" })
  firstName: string;

  @Column({ name: "last_name", type: "varchar", length: 255, nullable: true })
  lastName: string | null;

  @Column({ name: "username", type: "varchar", length: 255, nullable: true })
  username: string | null;

  /** E.164 when the participant shared a phone or it is visible on their Telegram profile. */
  @Column({ name: "phone", type: "varchar", length: 64, nullable: true })
  phone: string | null;

  @Column({ name: "profile_pic", type: "text", default: "" })
  profilePic: string;

  @Column({ name: "synced_at", type: "timestamptz", nullable: true })
  syncedAt: Date | null;

  @Column({ name: "last_seen", type: "timestamptz", nullable: true })
  lastSeen: Date | null;
}
