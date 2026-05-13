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
import { Client } from "./client.entity";
import { Conversation } from "./conversation.entity";
import { OrderSource } from "./order-source.enum";
import { OrderPaymentStatus } from "./order-payment-status.enum";
import { OrderDeliveryStatus } from "./order-delivery-status.enum";
import { OrderStatus } from "./order-status.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";
import { OrderItem } from "./order-item.entity";
import { OrderDeliveryInfo } from "./order-delivery-info.entity";
import { OrderEvent } from "./order-event.entity";

@Entity("orders")
@Index("IDX_orders_workspace_id", ["workspaceId"])
@Index("IDX_orders_customer_id", ["customerId"])
@Index("IDX_orders_conversation_id", ["conversationId"])
@Index("IDX_orders_status_id", ["statusId"])
export class Order {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

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

  @ManyToOne(() => Conversation, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation | null;

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

  @Column({
    name: "payment_status",
    type: "enum",
    enum: OrderPaymentStatus,
    enumName: "orders_payment_status_enum",
    default: OrderPaymentStatus.unpaid,
  })
  paymentStatus: OrderPaymentStatus;

  @Column({
    name: "delivery_status",
    type: "enum",
    enum: OrderDeliveryStatus,
    enumName: "orders_delivery_status_enum",
    default: OrderDeliveryStatus.pending,
  })
  deliveryStatus: OrderDeliveryStatus;

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

  @OneToMany(() => OrderItem, (i) => i.order)
  items: OrderItem[];

  @OneToMany(() => OrderDeliveryInfo, (d) => d.order)
  deliveryInfos: OrderDeliveryInfo[];

  @OneToMany(() => OrderEvent, (e) => e.order)
  events: OrderEvent[];
}
