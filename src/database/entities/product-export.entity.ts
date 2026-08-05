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

export type ProductExportScope = "all" | "filtered" | "selected";
export type ProductExportFormat = "xlsx" | "csv";
export type ProductExportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

@Entity({ name: "product_exports" })
@Index("IDX_product_exports_workspace_id", ["workspaceId"])
@Index("IDX_product_exports_workspace_status", ["workspaceId", "status"])
@Index("IDX_product_exports_status_created", ["status", "createdAt"])
export class ProductExport {
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

  @Column({ name: "scope", type: "varchar", length: 16 })
  scope: ProductExportScope;

  @Column({ name: "format", type: "varchar", length: 8 })
  format: ProductExportFormat;

  @Column({ name: "filters", type: "jsonb", nullable: true })
  filters: Record<string, unknown> | null;

  @Column({ name: "sort", type: "jsonb", nullable: true })
  sort: Record<string, unknown> | null;

  @Column({ name: "product_ids", type: "jsonb", nullable: true })
  productIds: number[] | null;

  @Column({ name: "status", type: "varchar", length: 16 })
  status: ProductExportStatus;

  @Column({ name: "file_key", type: "text", nullable: true })
  fileKey: string | null;

  @Column({ name: "file_name", type: "varchar", length: 512, nullable: true })
  fileName: string | null;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize: number | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({
    name: "include_purchase_price",
    type: "boolean",
    default: false,
  })
  includePurchasePrice: boolean;

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
