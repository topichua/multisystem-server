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
import { TelegramIntegrationStatus } from "./telegram-integration-status.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/**
 * Personal Telegram account linked via MTProto (GramJS), not a @BotFather bot.
 * `session_string` is a GramJS StringSession — treat as a secret.
 */
@Entity("telegram_integrations")
@Index("IDX_telegram_integrations_workspace_id", ["workspaceId"])
@Index("IDX_telegram_integrations_owner_id", ["ownerId"])
@Index("UQ_telegram_integrations_workspace_phone", ["workspaceId", "phoneNumber"], {
  unique: true,
})
export class TelegramIntegration {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "owner_id", type: "int" })
  ownerId: number;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "phone_number", type: "varchar", length: 32 })
  phoneNumber: string;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: TelegramIntegrationStatus.PENDING_CODE,
  })
  status: TelegramIntegrationStatus;

  @Column({ name: "telegram_user_id", type: "varchar", length: 32, nullable: true })
  telegramUserId: string | null;

  @Column({ name: "telegram_username", type: "varchar", length: 255, nullable: true })
  telegramUsername: string | null;

  /** GramJS session after successful login — secret. */
  @Column({ name: "session_string", type: "text", nullable: true })
  sessionString: string | null;

  /** Partial GramJS session between sendCode and SignIn. */
  @Column({ name: "auth_session_string", type: "text", nullable: true })
  authSessionString: string | null;

  @Column({ name: "phone_code_hash", type: "varchar", length: 255, nullable: true })
  phoneCodeHash: string | null;

  @Column({ name: "connected_at", type: "timestamptz", nullable: true })
  connectedAt: Date | null;

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_id" })
  owner: User;
}
