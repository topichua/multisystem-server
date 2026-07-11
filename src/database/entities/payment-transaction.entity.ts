import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Order } from "./order.entity";
import { PaymentProvider } from "./payment-provider.enum";
import { PaymentRequest } from "./payment-request.entity";
import { PaymentTransactionSource } from "./payment-transaction-source.enum";
import { PaymentTransactionStatus } from "./payment-transaction-status.enum";
import { PaymentTransactionType } from "./payment-transaction-type.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity("payment_transactions")
@Index("IDX_payment_transactions_workspace_id", ["workspaceId"])
@Index("IDX_payment_transactions_order_id", ["workspaceId", "orderId"])
@Index("IDX_payment_transactions_payment_id", ["paymentId"])
@Index("UQ_payment_transactions_provider_external_id", ["provider", "externalTransactionId"], {
  unique: true,
  where: `"external_transaction_id" IS NOT NULL`,
})
export class PaymentTransaction {
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

  @Column({ name: "payment_id", type: "int", nullable: true })
  paymentId: number | null;

  @ManyToOne(() => PaymentRequest, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "payment_id" })
  payment: PaymentRequest | null;

  @Column({
    type: "enum",
    enum: PaymentProvider,
    enumName: "payment_provider_enum",
    nullable: true,
  })
  provider: PaymentProvider | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({
    type: "enum",
    enum: PaymentTransactionType,
    enumName: "payment_transaction_type_enum",
  })
  type: PaymentTransactionType;

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
    enum: PaymentTransactionStatus,
    enumName: "payment_transaction_status_enum",
    default: PaymentTransactionStatus.succeeded,
  })
  status: PaymentTransactionStatus;

  @Column({
    type: "enum",
    enum: PaymentTransactionSource,
    enumName: "payment_transaction_source_enum",
  })
  source: PaymentTransactionSource;

  @Column({
    name: "external_transaction_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  externalTransactionId: string | null;

  @Column({ name: "confirmed_by_id", type: "int", nullable: true })
  confirmedById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "confirmed_by_id" })
  confirmedBy: User | null;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
