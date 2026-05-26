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

import { ProductMediaType } from "./product-media-type.enum";
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";
import { UploadMedia } from "./upload-media.entity";

@Entity({ name: "product_media" })
@Index("IDX_product_media_product_id", ["productId"])
@Index("IDX_product_media_variant_id", ["variantId"])
@Index("IDX_product_media_upload_media_id", ["uploadMediaId"])
export class ProductMedia {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

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

  @Column({ name: "upload_media_id", type: "int", nullable: true })
  uploadMediaId: number | null;

  @ManyToOne(() => UploadMedia, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "upload_media_id" })
  uploadMedia: UploadMedia | null;

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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
