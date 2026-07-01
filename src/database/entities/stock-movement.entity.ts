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
import { OrderItem } from "./order-item.entity";
import { ProductVariant } from "./product-variant.entity";
import { StockMovementType } from "./stock-movement-type.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

const moneyTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: "stock_movements" })
@Index("IDX_stock_movements_workspace_id", ["workspaceId"])
@Index("IDX_stock_movements_variant_id", ["variantId"])
@Index("IDX_stock_movements_created_at", ["createdAt"])
export class StockMovement {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "variant_id", type: "int" })
  variantId: number;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variant_id" })
  variant: ProductVariant;

  @Column({
    type: "enum",
    enum: StockMovementType,
    enumName: "stock_movement_type_enum",
  })
  type: StockMovementType;

  @Column({ name: "quantity_change", type: "int" })
  quantityChange: number;

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
    name: "total_cost_change",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  totalCostChange: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  reason: string | null;

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

  @Column({ name: "user_id", type: "int", nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
