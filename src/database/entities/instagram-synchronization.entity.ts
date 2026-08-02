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
import { InstagramIntegration } from "./instagram-integration.entity";
import {
  INSTAGRAM_SYNCHRONIZATION_PHASES,
  INSTAGRAM_SYNCHRONIZATION_STATUSES,
  type InstagramSynchronizationPhase,
  type InstagramSynchronizationStatus,
} from "./instagram-synchronization-status";
import { Workspace } from "./workspace.entity";

@Entity({ name: "instagram_synchronizations" })
@Index("IDX_instagram_synchronizations_workspace_id", ["workspaceId"])
@Index("IDX_instagram_synchronizations_integration_id", ["integrationId"])
@Index("IDX_instagram_synchronizations_status", ["status"])
export class InstagramSynchronization {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "integration_id", type: "int" })
  integrationId: number;

  @ManyToOne(() => InstagramIntegration, { onDelete: "CASCADE" })
  @JoinColumn({ name: "integration_id" })
  integration: InstagramIntegration;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: "pending",
  })
  status: InstagramSynchronizationStatus;

  @Column({
    name: "phase",
    type: "varchar",
    length: 32,
    default: "conversations",
  })
  phase: InstagramSynchronizationPhase;

  /** Messages/conversations older than this are out of scope (typically now − 7 days). */
  @Column({ name: "since_at", type: "timestamptz" })
  sinceAt: Date;

  @Column({ name: "window_days", type: "int", default: 7 })
  windowDays: number;

  @Column({ name: "conversations_total", type: "int", default: 0 })
  conversationsTotal: number;

  @Column({ name: "conversations_processed", type: "int", default: 0 })
  conversationsProcessed: number;

  @Column({ name: "conversations_failed", type: "int", default: 0 })
  conversationsFailed: number;

  @Column({ name: "messages_imported", type: "int", default: 0 })
  messagesImported: number;

  @Column({ name: "error", type: "text", nullable: true })
  error: string | null;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt: Date | null;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}

export {
  INSTAGRAM_SYNCHRONIZATION_PHASES,
  INSTAGRAM_SYNCHRONIZATION_STATUSES,
  type InstagramSynchronizationPhase,
  type InstagramSynchronizationStatus,
};
