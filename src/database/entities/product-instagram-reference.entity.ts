import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { ProductVariant } from "./product-variant.entity";
import { Product } from "./product.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity({ name: "product_instagram_references" })
@Index("IDX_product_instagram_references_workspace_id", ["workspaceId"])
@Index("IDX_product_instagram_references_product_id", ["productId"])
@Index("IDX_product_instagram_references_post_id", ["postId"])
@Index("IDX_product_instagram_references_product_variant_id", [
  "productVariantId",
])
@Index("IDX_product_instagram_references_instagram_account_id", [
  "instagramAccountId",
])
export class ProductInstagramReference {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "instagram_account_id", type: "varchar", length: 255 })
  instagramAccountId: string;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "product_variant_id", type: "int", nullable: true })
  productVariantId: number | null;

  @ManyToOne(() => ProductVariant, (v) => v.instagramReferences, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "product_variant_id" })
  productVariant: ProductVariant | null;

  @Column({ type: "text", nullable: true })
  permalink: string | null;

  @Column({ name: "post_id", type: "varchar", length: 255 })
  postId: string;

  @Column({ name: "created_by_id", type: "int" })
  createdById: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
