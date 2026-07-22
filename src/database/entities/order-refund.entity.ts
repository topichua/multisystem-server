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
import { Order } from "./order.entity";
import { OrderRefundStatus } from "./order-refund-status.enum";
import { PaymentTransaction } from "./payment-transaction.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/**
 * Order refund request. Stays `pending` until a manager approves or rejects.
 * On approve, a succeeded `payment_transactions` refund row is created and order
 * payment status is recalculated (paid → partial / unpaid / refunded).
 */
@Entity("order_refunds")
@Index("IDX_order_refunds_workspace_id", ["workspaceId"])
@Index("IDX_order_refunds_order_id", ["workspaceId", "orderId"])
@Index("IDX_order_refunds_status", ["workspaceId", "status"])
export class OrderRefund {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @ManyToOne(() => Order, { onDelete: "RESTRICT" })
  @JoinColumn([
    { name: "workspace_id", referencedColumnName: "workspaceId" },
    { name: "order_id", referencedColumnName: "id" },
  ])
  order: Order;

  @Column({
    type: "decimal",
    precision: 14,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  amount: number;

  @Column({ type: "varchar", length: 8 })
  currency: string;

  @Column({
    type: "enum",
    enum: OrderRefundStatus,
    enumName: "order_refund_status_enum",
    default: OrderRefundStatus.pending,
  })
  status: OrderRefundStatus;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ name: "created_by_id", type: "int" })
  createdById: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;

  @Column({ name: "reviewed_by_id", type: "int", nullable: true })
  reviewedById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reviewed_by_id" })
  reviewedBy: User | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt: Date | null;

  @Column({ name: "payment_transaction_id", type: "int", nullable: true })
  paymentTransactionId: number | null;

  @ManyToOne(() => PaymentTransaction, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "payment_transaction_id" })
  paymentTransaction: PaymentTransaction | null;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
