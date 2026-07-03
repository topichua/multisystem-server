import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { TelegramIntegration } from "./telegram-integration.entity";

@Entity("telegram_integration_locks")
export class TelegramIntegrationLock {
  @PrimaryColumn({ name: "integration_id", type: "int" })
  integrationId: number;

  @OneToOne(() => TelegramIntegration, { onDelete: "CASCADE" })
  @JoinColumn({ name: "integration_id" })
  integration: TelegramIntegration;

  @Column({ name: "locked_by_instance_id", type: "varchar", length: 255 })
  lockedByInstanceId: string;

  @Column({ name: "lock_version", type: "int", default: 1 })
  lockVersion: number;

  @Column({ name: "locked_at", type: "timestamptz" })
  lockedAt: Date;

  @Column({ name: "heartbeat_at", type: "timestamptz" })
  heartbeatAt: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
