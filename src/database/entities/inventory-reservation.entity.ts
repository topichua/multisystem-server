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
import { InventoryReservationStatus } from "./inventory-reservation-status.enum";
import { Order } from "./order.entity";
import { OrderItem } from "./order-item.entity";
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity({ name: "inventory_reservations" })
@Index("IDX_inventory_reservations_order_item_id", ["orderItemId"])
@Index("IDX_inventory_reservations_variant_id", ["variantId"])
@Index("IDX_inventory_reservations_status", ["status"])
export class InventoryReservation {
  @PrimaryGeneratedColumn("uuid", { name: "id" })
  id: string;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "variant_id", type: "int" })
  variantId: number;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variant_id" })
  variant: ProductVariant;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @ManyToOne(() => Order, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ name: "order_item_id", type: "int" })
  orderItemId: number;

  @ManyToOne(() => OrderItem, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_item_id" })
  orderItem: OrderItem;

  @Column({ type: "int" })
  quantity: number;

  @Column({
    type: "enum",
    enum: InventoryReservationStatus,
    enumName: "inventory_reservation_status_enum",
    default: InventoryReservationStatus.active,
  })
  status: InventoryReservationStatus;

  @Column({ name: "reserved_by_user_id", type: "int", nullable: true })
  reservedByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reserved_by_user_id" })
  reservedByUser: User | null;

  @Column({ name: "reserved_at", type: "timestamptz" })
  reservedAt: Date;

  @Column({ name: "released_by_user_id", type: "int", nullable: true })
  releasedByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "released_by_user_id" })
  releasedByUser: User | null;

  @Column({ name: "released_at", type: "timestamptz", nullable: true })
  releasedAt: Date | null;

  @Column({ name: "deducted_by_user_id", type: "int", nullable: true })
  deductedByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "deducted_by_user_id" })
  deductedByUser: User | null;

  @Column({ name: "deducted_at", type: "timestamptz", nullable: true })
  deductedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
