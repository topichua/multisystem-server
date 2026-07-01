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
import { ProductVariant } from "./product-variant.entity";
import { Workspace } from "./workspace.entity";

const moneyTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: "variant_stocks" })
@Index("UQ_variant_stocks_variant_id", ["variantId"], { unique: true })
@Index("IDX_variant_stocks_workspace_id", ["workspaceId"])
export class VariantStock {
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

  @Column({ type: "int", default: 0 })
  quantity: number;

  @Column({
    name: "avg_purchase_price",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  avgPurchasePrice: number | null;

  @Column({
    name: "total_cost",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  totalCost: number | null;

  @Column({ name: "stock_initialized", type: "boolean", default: false })
  stockInitialized: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
