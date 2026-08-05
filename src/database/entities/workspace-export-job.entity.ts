import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

export type WorkspaceExportFormat = "xlsx" | "csv";
export type WorkspaceExportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

/** Resource type — extend for customers, payments, inventory later. */
export type WorkspaceExportType = "orders" | "products";

@Entity({ name: "workspace_export_jobs" })
@Index("IDX_workspace_export_jobs_workspace_id", ["workspaceId"])
@Index("IDX_workspace_export_jobs_workspace_status", ["workspaceId", "status"])
@Index("IDX_workspace_export_jobs_status_created", ["status", "createdAt"])
@Index("IDX_workspace_export_jobs_type_status", ["type", "status"])
export class WorkspaceExportJob {
  @PrimaryColumn({ name: "id", type: "varchar", length: 64 })
  id: string;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "requested_by_id", type: "int" })
  requestedById: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requested_by_id" })
  requestedBy: User;

  /** Which resource this export generates (`orders`, …). */
  @Column({ name: "type", type: "varchar", length: 32 })
  type: WorkspaceExportType;

  /**
   * Resource-specific subtype.
   * Orders: `orders` | `order_items`.
   */
  @Column({ name: "mode", type: "varchar", length: 32, nullable: true })
  mode: string | null;

  @Column({ name: "format", type: "varchar", length: 8 })
  format: WorkspaceExportFormat;

  /** Snapshot of list filters at create time. */
  @Column({ name: "filters", type: "jsonb", nullable: true })
  filters: Record<string, unknown> | null;

  /** Extra options (sort, scope, productIds, …). */
  @Column({ name: "options", type: "jsonb", nullable: true })
  options: Record<string, unknown> | null;

  @Column({ name: "status", type: "varchar", length: 16 })
  status: WorkspaceExportStatus;

  /** 0–100. */
  @Column({ name: "progress", type: "int", default: 0 })
  progress: number;

  @Column({ name: "file_key", type: "text", nullable: true })
  fileKey: string | null;

  @Column({ name: "file_name", type: "varchar", length: 512, nullable: true })
  fileName: string | null;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize: number | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt: Date | null;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;
}
