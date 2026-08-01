import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";
import { StockSupply } from "./stock-supply.entity";

@Entity({ name: "stock_supply_items" })
@Index("IDX_stock_supply_items_supply_id", ["supplyId"])
export class StockSupplyItem {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "supply_id", type: "int" })
  supplyId: number;

  @ManyToOne(() => StockSupply, (supply) => supply.items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "supply_id" })
  supply: StockSupply;

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

  @Column({ name: "quantity", type: "int" })
  quantity: number;

  @Column({
    name: "buy_price",
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) =>
        value == null ? 0 : Number(value),
    },
  })
  buyPrice: number;
}
