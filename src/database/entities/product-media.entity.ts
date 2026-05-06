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

import { Company } from "./company.entity";
import { ProductMediaType } from "./product-media-type.enum";
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";
import { User } from "./user.entity";

@Entity({ name: "product_media" })
@Index("IDX_product_media_product_id", ["productId"])
@Index("IDX_product_media_variant_id", ["variantId"])
export class ProductMedia {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "company_id", type: "int" })
  companyId: number;

  @ManyToOne(() => Company, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, (p) => p.media, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "variant_id", type: "int", nullable: true })
  variantId: number | null;

  @ManyToOne(() => ProductVariant, (v) => v.media, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "variant_id" })
  variant: ProductVariant | null;

  @Column({ type: "text" })
  url: string;

  @Column({
    type: "enum",
    enum: ProductMediaType,
    enumName: "product_media_type_enum",
  })
  type: ProductMediaType;

  @Column({ name: "source_url", type: "text", nullable: true })
  sourceUrl: string | null;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

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
