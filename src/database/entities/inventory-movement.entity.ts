import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { InventoryMovementReason } from "./inventory-movement-reason.enum";
import { InventoryMovementType } from "./inventory-movement-type.enum";
import { Order } from "./order.entity";
import { OrderItem } from "./order-item.entity";
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

const moneyTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: "inventory_movements" })
@Index("IDX_inventory_movements_workspace_id", ["workspaceId"])
@Index("IDX_inventory_movements_variant_id", ["variantId"])
@Index("IDX_inventory_movements_created_at", ["createdAt"])
export class InventoryMovement {
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

  @Column({
    type: "enum",
    enum: InventoryMovementType,
    enumName: "inventory_movement_type_enum",
  })
  type: InventoryMovementType;

  @Column({
    type: "enum",
    enum: InventoryMovementReason,
    enumName: "inventory_movement_reason_enum",
  })
  reason: InventoryMovementReason;

  @Column({ name: "quantity_delta", type: "int" })
  quantityDelta: number;

  @Column({ name: "quantity_before", type: "int" })
  quantityBefore: number;

  @Column({ name: "quantity_after", type: "int" })
  quantityAfter: number;

  @Column({
    name: "purchase_price",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  purchasePrice: number | null;

  @Column({
    name: "stock_cost_before",
    type: "decimal",
    precision: 14,
    scale: 2,
    transformer: moneyTransformer,
  })
  stockCostBefore: number;

  @Column({
    name: "stock_cost_after",
    type: "decimal",
    precision: 14,
    scale: 2,
    transformer: moneyTransformer,
  })
  stockCostAfter: number;

  @Column({
    name: "average_purchase_price_before",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  averagePurchasePriceBefore: number | null;

  @Column({
    name: "average_purchase_price_after",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  averagePurchasePriceAfter: number | null;

  @Column({ type: "text", nullable: true })
  comment: string | null;

  @Column({ name: "order_id", type: "int", nullable: true })
  orderId: number | null;

  @ManyToOne(() => Order, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "order_id" })
  order: Order | null;

  @Column({ name: "order_item_id", type: "int", nullable: true })
  orderItemId: number | null;

  @ManyToOne(() => OrderItem, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "order_item_id" })
  orderItem: OrderItem | null;

  @Column({ name: "created_by_user_id", type: "int", nullable: true })
  createdByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
