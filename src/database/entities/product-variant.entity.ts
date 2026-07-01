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

import { ProductMedia } from "./product-media.entity";
import { ProductInstagramReference } from "./product-instagram-reference.entity";
import { ProductVariantCustomFieldValue } from "./product-variant-custom-field-value.entity";
import { Product } from "./product.entity";
import { ProductStatus } from "./product-status.enum";
import { User } from "./user.entity";

@Entity({ name: "product_variants" })
@Index("IDX_product_variants_product_id", ["productId"])
@Index("IDX_product_variants_status", ["status"])
export class ProductVariant {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @OneToMany(() => ProductMedia, (m) => m.variant)
  media: ProductMedia[];

  @OneToMany(() => ProductVariantCustomFieldValue, (v) => v.variant)
  customFieldValues: ProductVariantCustomFieldValue[];

  @OneToMany(() => ProductInstagramReference, (r) => r.productVariant)
  instagramReferences: ProductInstagramReference[];

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

  @Column({ name: "in_stock", type: "boolean", nullable: true })
  inStock: boolean | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  sku: string | null;

  @Column({
    type: "enum",
    enum: ProductStatus,
    enumName: "products_status_enum",
    default: ProductStatus.draft,
  })
  status: ProductStatus;

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
}
