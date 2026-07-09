import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { Workspace } from "./workspace.entity";

@Entity({ name: "workspace_entitlements" })
export class WorkspaceEntitlements {
  @PrimaryColumn({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @OneToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "social_accounts_limit", type: "int", nullable: true })
  socialAccountsLimit: number | null;

  @Column({ name: "private_accounts_limit", type: "int", nullable: true })
  privateAccountsLimit: number | null;

  @Column({ name: "wishlist_enabled", type: "boolean", default: false })
  wishlistEnabled: boolean;

  @Column({ name: "advanced_inventory_enabled", type: "boolean", default: false })
  advancedInventoryEnabled: boolean;

  @Column({ name: "advanced_analytics_enabled", type: "boolean", default: false })
  advancedAnalyticsEnabled: boolean;

  @Column({ name: "ai_credits_monthly", type: "int", default: 0 })
  aiCreditsMonthly: number;

  @Column({ name: "ai_credits_used", type: "int", default: 0 })
  aiCreditsUsed: number;

  @Column({ name: "credits_reset_at", type: "timestamptz", nullable: true })
  creditsResetAt: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
