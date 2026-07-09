import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { WorkspaceEntitlementsSnapshot } from "../../billing/types/workspace-entitlements.interface";
import { Invoice } from "./invoice.entity";
import { SubscriptionChangeType } from "./subscription-change-type.enum";
import { User } from "./user.entity";
import { WorkspaceSubscription } from "./workspace-subscription.entity";

@Entity({ name: "subscription_changes" })
@Index("IDX_subscription_changes_subscription_id", ["subscriptionId"])
export class SubscriptionChange {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "subscription_id", type: "int" })
  subscriptionId: number;

  @ManyToOne(() => WorkspaceSubscription, { onDelete: "CASCADE" })
  @JoinColumn({ name: "subscription_id" })
  subscription: WorkspaceSubscription;

  @Column({
    name: "change_type",
    type: "enum",
    enum: SubscriptionChangeType,
    enumName: "subscription_change_type_enum",
  })
  changeType: SubscriptionChangeType;

  @Column({ name: "from_entitlements", type: "jsonb", nullable: true })
  fromEntitlements: WorkspaceEntitlementsSnapshot | null;

  @Column({ name: "to_entitlements", type: "jsonb" })
  toEntitlements: WorkspaceEntitlementsSnapshot;

  @Column({ name: "invoice_id", type: "int", nullable: true })
  invoiceId: number | null;

  @ManyToOne(() => Invoice, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "invoice_id" })
  invoice: Invoice | null;

  @Column({ name: "created_by_user_id", type: "int", nullable: true })
  createdByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_user_id" })
  createdBy: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
