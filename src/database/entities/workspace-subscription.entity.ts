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
import { BillingCycle } from "./billing-cycle.enum";
import { PlanTemplate } from "./plan-template.entity";
import { SubscriptionStatus } from "./subscription-status.enum";
import { Workspace } from "./workspace.entity";

@Entity({ name: "workspace_subscriptions" })
@Index("IDX_workspace_subscriptions_workspace_id", ["workspaceId"])
@Index("IDX_workspace_subscriptions_status", ["status"])
export class WorkspaceSubscription {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "plan_template_id", type: "int", nullable: true })
  planTemplateId: number | null;

  @ManyToOne(() => PlanTemplate, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "plan_template_id" })
  planTemplate: PlanTemplate | null;

  @Column({
    type: "enum",
    enum: SubscriptionStatus,
    enumName: "workspace_subscription_status_enum",
    default: SubscriptionStatus.active,
  })
  status: SubscriptionStatus;

  @Column({ name: "entitlements_snapshot", type: "jsonb" })
  entitlementsSnapshot: WorkspaceEntitlementsSnapshot;

  @Column({
    name: "billing_cycle",
    type: "enum",
    enum: BillingCycle,
    enumName: "billing_cycle_enum",
    default: BillingCycle.monthly,
  })
  billingCycle: BillingCycle;

  @Column({ name: "period_start", type: "timestamptz" })
  periodStart: Date;

  @Column({ name: "period_end", type: "timestamptz" })
  periodEnd: Date;

  @Column({ name: "custom_label", type: "varchar", length: 255, nullable: true })
  customLabel: string | null;

  @Column({ name: "canceled_at", type: "timestamptz", nullable: true })
  canceledAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
