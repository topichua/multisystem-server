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
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";

@Entity("order_items")
@Index("IDX_order_items_order_id", ["orderId"])
export class OrderItem {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "variant_id", type: "int" })
  variantId: number;

  @ManyToOne(() => ProductVariant, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "variant_id" })
  variant: ProductVariant;

  @Column({ type: "int" })
  quantity: number;

  @Column({
    name: "unit_price_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  unitPriceAmount: number;

  @Column({
    name: "total_price_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v == null ? 0 : Number(v)),
    },
  })
  totalPriceAmount: number;

  @Column({ name: "product_title_snapshot", type: "varchar", length: 512 })
  productTitleSnapshot: string;

  @Column({
    name: "variant_title_snapshot",
    type: "varchar",
    length: 512,
    nullable: true,
  })
  variantTitleSnapshot: string | null;

  @Column({
    name: "sku_snapshot",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  skuSnapshot: string | null;

  @Column({ name: "image_url_snapshot", type: "text", nullable: true })
  imageUrlSnapshot: string | null;

  @Column({
    name: "variant_attributes_snapshot",
    type: "jsonb",
    nullable: true,
  })
  variantAttributesSnapshot: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
