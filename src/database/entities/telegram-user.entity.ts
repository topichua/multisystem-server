import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("telegram_users")
@Index("IDX_telegram_users_username", ["username"])
export class TelegramUser {
  /** Telegram user id (matches `conversations.participant_id`). Primary key. */
  @PrimaryColumn({ name: "id", type: "varchar", length: 32 })
  id: string;

  @Column({ name: "first_name", type: "varchar", length: 255, default: "" })
  firstName: string;

  @Column({ name: "last_name", type: "varchar", length: 255, nullable: true })
  lastName: string | null;

  @Column({ name: "username", type: "varchar", length: 255, nullable: true })
  username: string | null;

  @Column({ name: "profile_pic", type: "text", default: "" })
  profilePic: string;

  @Column({ name: "synced_at", type: "timestamptz", nullable: true })
  syncedAt: Date | null;

  @Column({ name: "last_seen", type: "timestamptz", nullable: true })
  lastSeen: Date | null;
}
