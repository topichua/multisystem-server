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
import type { WorkspaceEntitlementsSnapshot } from "../../billing/types/workspace-entitlements.interface";
import { Workspace } from "./workspace.entity";

const moneyTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: "plan_templates" })
@Index("IDX_plan_templates_workspace_id", ["workspaceId"])
export class PlanTemplate {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ type: "varchar", length: 64 })
  slug: string;

  @Column({ type: "varchar", length: 120 })
  name: string;

  @Column({ name: "is_public", type: "boolean", default: true })
  isPublic: boolean;

  @Column({ name: "workspace_id", type: "int", nullable: true })
  workspaceId: number | null;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace | null;

  @Column({ type: "jsonb" })
  entitlements: WorkspaceEntitlementsSnapshot;

  @Column({
    name: "price_monthly",
    type: "decimal",
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  priceMonthly: number;

  @Column({
    name: "price_yearly",
    type: "decimal",
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  priceYearly: number;

  @Column({ type: "varchar", length: 8, default: "UAH" })
  currency: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
