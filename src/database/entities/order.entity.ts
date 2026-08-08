import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { Client } from "./client.entity";
import { Conversation } from "./conversation.entity";
import { OrderSource } from "./order-source.enum";
import { OrderPaymentStatus } from "./order-payment-status.enum";
import { OrderStatus } from "./order-status.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";
import { OrderItem } from "./order-item.entity";
import { OrderDeliveryInfo } from "./order-delivery-info.entity";
import { OrderDeliveryProvider } from "./order-delivery-provider.enum";
import { OrderEvent } from "./order-event.entity";
import { ManualPaymentMethod } from "./manual-payment-method.entity";
import type { PaymentTransaction } from "./payment-transaction.entity";

@Entity("orders")
@Index("IDX_orders_workspace_id", ["workspaceId"])
@Index("IDX_orders_customer_id", ["customerId"])
@Index("IDX_orders_conversation_id", ["conversationId"])
@Index("IDX_orders_integration_id", ["integrationId"])
@Index("IDX_orders_status_id", ["statusId"])
export class Order {
  @PrimaryColumn({ name: "workspace_id", type: "int" })
  workspaceId: number;

  /** Per-workspace sequential order number (starts at 1001). */
  @PrimaryColumn({ name: "id", type: "int" })
  id: number;

  @ManyToOne(() => Workspace, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "customer_id", type: "int" })
  customerId: number;

  @ManyToOne(() => Client, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: Client;

  @Column({ name: "conversation_id", type: "int", nullable: true })
  conversationId: number | null;

  /**
   * FK is (workspace_id, conversation_id). ON DELETE RESTRICT — null conversation_id
   * before deleting the conversation (workspace_id is order PK, cannot SET NULL).
   */
  @ManyToOne(() => Conversation, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn([
    { name: "workspace_id", referencedColumnName: "workspaceId" },
    { name: "conversation_id", referencedColumnName: "id" },
  ])
  conversation: Conversation | null;

  /**
   * Instagram or Telegram integration that originated this order.
   * Resolved from `conversation.external_source_id` when `conversationId` is set.
   * No DB FK — `source` disambiguates which integration table `integration_id` refers to.
   */
  @Column({ name: "integration_id", type: "int", nullable: true })
  integrationId: number | null;

  @Column({
    type: "enum",
    enum: OrderSource,
    enumName: "orders_order_source_enum",
  })
  source: OrderSource;

  @Column({ name: "status_id", type: "int" })
  statusId: number;

  @ManyToOne(() => OrderStatus, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "status_id" })
  status: OrderStatus;

  /** When the current `statusId` was entered (for ORDER_STATUS automations). */
  @Column({ name: "status_changed_at", type: "timestamptz", nullable: true })
  statusChangedAt: Date | null;

  @Column({
    name: "payment_status",
    type: "enum",
    enum: OrderPaymentStatus,
    enumName: "orders_payment_status_enum",
    default: OrderPaymentStatus.unpaid,
  })
  paymentStatus: OrderPaymentStatus;

  /** When the current `paymentStatus` value was set (not `updatedAt`). */
  @Column({ name: "payment_status_at", type: "timestamptz", nullable: true })
  paymentStatusAt: Date | null;

  @Column({ name: "currency", type: "varchar", length: 8 })
  currency: string;

  @Column({
    name: "subtotal_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  subtotalAmount: number;

  @Column({
    name: "discount_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  discountAmount: number;

  @Column({
    name: "discount_percent",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  discountPercent: number | null;

  @Column({
    name: "delivery_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  deliveryAmount: number;

  @Column({
    name: "total_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  totalAmount: number;

  @Column({ name: "customer_note", type: "text", nullable: true })
  customerNote: string | null;

  @Column({ name: "internal_note", type: "text", nullable: true })
  internalNote: string | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @Column({
    name: "payment_reference",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  paymentReference: string | null;

  @Column({ name: "manual_payment_method_id", type: "int", nullable: true })
  manualPaymentMethodId: number | null;

  @ManyToOne(() => ManualPaymentMethod, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "manual_payment_method_id" })
  manualPaymentMethod: ManualPaymentMethod | null;

  @Column({ name: "created_by_id", type: "int" })
  createdById: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;

  @Column({ name: "updated_by_id", type: "int", nullable: true })
  updatedById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_id" })
  updatedBy: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @Column({ name: "delivery_id", type: "int", nullable: true })
  deliveryId: number | null;

  @Column({
    name: "delivery_type",
    type: "enum",
    enum: OrderDeliveryProvider,
    enumName: "order_delivery_provider_enum",
    nullable: true,
  })
  deliveryType: OrderDeliveryProvider | null;

  @OneToMany(() => OrderItem, (i) => i.order)
  items: OrderItem[];

  /** Hydrated in OrdersService when loading a single order (not a DB column). */
  deliveryInfo?: OrderDeliveryInfo | null;

  /** Hydrated: true when Nova Poshta TTN can still be deleted (before `shipped`). */
  canRemoveTracking?: boolean;

  /** Hydrated: true when line items can be edited (status category is `new`). */
  canEditItems?: boolean;

  /** Hydrated payment summary for order responses (not a DB column). */
  payment?: {
    status: OrderPaymentStatus;
    statusAt: Date | null;
    paidAt: Date | null;
    reference: string | null;
    manualPaymentMethodId: number | null;
    paidAmount: number;
    remainingAmount: number;
    canCreatePayment: boolean;
    canRefund: boolean;
    payments: Array<
      PaymentTransaction & {
        method: "online_payment" | "manual" | "nova_poshta_payment";
      }
    >;
  };

  @OneToMany(() => OrderEvent, (e) => e.order)
  events: OrderEvent[];
}
