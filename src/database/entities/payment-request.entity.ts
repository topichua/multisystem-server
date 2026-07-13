import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Order } from "./order.entity";
import { PaymentIntegration } from "./payment-integration.entity";
import { PaymentProvider } from "./payment-provider.enum";
import { PaymentMethod } from "./payment-method.enum";
import { PaymentRequestStatus } from "./payment-request-status.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";
import { PaymentTransaction } from "./payment-transaction.entity";

@Entity("payment_requests")
@Index("IDX_payment_requests_workspace_id", ["workspaceId"])
@Index("IDX_payment_requests_order_id", ["workspaceId", "orderId"])
@Index("IDX_payment_requests_integration_id", ["integrationId"])
@Index(
  "UQ_payment_requests_provider_external_payment_id",
  ["provider", "externalPaymentId"],
  {
    unique: true,
    where: `"external_payment_id" IS NOT NULL`,
  },
)
export class PaymentRequest {
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

  @Column({ name: "integration_id", type: "int" })
  integrationId: number;

  @ManyToOne(() => PaymentIntegration, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "integration_id" })
  integration: PaymentIntegration;

  @Column({
    type: "enum",
    enum: PaymentMethod,
    enumName: "payment_method_enum",
    default: PaymentMethod.online_payment,
  })
  method: PaymentMethod;

  @Column({
    type: "enum",
    enum: PaymentProvider,
    enumName: "payment_provider_enum",
  })
  provider: PaymentProvider;

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
    enum: PaymentRequestStatus,
    enumName: "payment_request_status_enum",
    default: PaymentRequestStatus.pending,
  })
  status: PaymentRequestStatus;

  @Column({
    name: "external_payment_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  externalPaymentId: string | null;

  @Column({ name: "payment_url", type: "text", nullable: true })
  paymentUrl: string | null;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @Column({ name: "failure_reason", type: "text", nullable: true })
  failureReason: string | null;

  @Column({ name: "created_by_id", type: "int" })
  createdById: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @OneToMany(() => PaymentTransaction, (t) => t.payment)
  transactions: PaymentTransaction[];
}
