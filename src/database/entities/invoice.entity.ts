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
import { InvoiceStatus } from "./invoice-status.enum";
import { Workspace } from "./workspace.entity";
import { WorkspaceSubscription } from "./workspace-subscription.entity";

const moneyTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

export type InvoiceLinePurpose =
  | "subscribe"
  | "upgrade"
  | "downgrade"
  | "renewal"
  | "custom";

export type InvoiceLineItem = {
  type: string;
  description: string;
  amount: number;
  quantity?: number;
  planTemplateId?: number;
  planSlug?: string;
  billingCycle?: string;
  purpose?: InvoiceLinePurpose;
};

@Entity({ name: "invoices" })
@Index("IDX_invoices_workspace_id", ["workspaceId"])
@Index("IDX_invoices_status", ["status"])
@Index("UQ_invoices_number", ["number"], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "subscription_id", type: "int", nullable: true })
  subscriptionId: number | null;

  @ManyToOne(() => WorkspaceSubscription, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "subscription_id" })
  subscription: WorkspaceSubscription | null;

  @Column({ type: "varchar", length: 64 })
  number: string;

  @Column({
    type: "enum",
    enum: InvoiceStatus,
    enumName: "invoice_status_enum",
    default: InvoiceStatus.open,
  })
  status: InvoiceStatus;

  @Column({
    type: "decimal",
    precision: 14,
    scale: 2,
    transformer: moneyTransformer,
  })
  amount: number;

  @Column({ type: "varchar", length: 8, default: "UAH" })
  currency: string;

  @Column({ name: "period_start", type: "timestamptz", nullable: true })
  periodStart: Date | null;

  @Column({ name: "period_end", type: "timestamptz", nullable: true })
  periodEnd: Date | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "line_items", type: "jsonb", default: () => "'[]'" })
  lineItems: InvoiceLineItem[];

  @Column({ name: "due_at", type: "timestamptz", nullable: true })
  dueAt: Date | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @Column({ name: "external_payment_id", type: "varchar", length: 255, nullable: true })
  externalPaymentId: string | null;

  @Column({ name: "payment_page_url", type: "text", nullable: true })
  paymentPageUrl: string | null;

  @Column({ name: "payment_provider", type: "varchar", length: 32, nullable: true })
  paymentProvider: string | null;

  @Column({
    name: "payment_provider_modified_at",
    type: "timestamptz",
    nullable: true,
  })
  paymentProviderModifiedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
