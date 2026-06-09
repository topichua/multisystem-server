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

import { ProductCategory } from "./product-category.entity";
import { ProductMedia } from "./product-media.entity";
import { ProductSourceType } from "./product-source-type.enum";
import { ProductStatus } from "./product-status.enum";
import { ProductType } from "./product-type.enum";
import { ProductVariant } from "./product-variant.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity({ name: "products" })
@Index("IDX_products_workspace_id", ["workspaceId"])
@Index("IDX_products_workspace_id_status", ["workspaceId", "status"])
@Index("IDX_products_category_id", ["categoryId"])
export class Product {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "category_id", type: "int", nullable: true })
  categoryId: number | null;

  @ManyToOne(() => ProductCategory, (c) => c.products, {
    onDelete: "RESTRICT",
    nullable: true,
  })
  @JoinColumn({ name: "category_id" })
  category: ProductCategory | null;

  @Column({ type: "varchar", length: 512 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({
    type: "enum",
    enum: ProductStatus,
    enumName: "products_status_enum",
    default: ProductStatus.draft,
  })
  status: ProductStatus;

  @Column({
    name: "product_type",
    type: "enum",
    enum: ProductType,
    enumName: "products_product_type_enum",
    default: ProductType.single,
  })
  productType: ProductType;

  @Column({
    name: "source_type",
    type: "enum",
    enum: ProductSourceType,
    enumName: "products_source_type_enum",
    nullable: true,
  })
  sourceType: ProductSourceType | null;

  @Column({
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  price: number | null;

  @Column({ type: "varchar", length: 8, default: "UAH" })
  currency: string;

  @Column({ name: "in_stock", type: "boolean", nullable: true })
  inStock: boolean | null;

  @Column({ type: "int", nullable: true })
  quantity: number | null;

  @Column({ name: "created_by_user_id", type: "int" })
  createdByUserId: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User;

  @Column({ name: "updated_by_user_id", type: "int", nullable: true })
  updatedByUserId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_user_id" })
  updatedByUser: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @OneToMany(() => ProductVariant, (v) => v.product)
  variants: ProductVariant[];

  @OneToMany(() => ProductMedia, (m) => m.product)
  media: ProductMedia[];

}
