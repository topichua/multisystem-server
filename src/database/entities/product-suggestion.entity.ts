import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";
import { ProductVariant } from "./product-variant.entity";
import { Product } from "./product.entity";

@Entity({ name: "product_suggestions" })
@Index("IDX_product_suggestions_conversation_id", ["conversationId"])
@Index("IDX_product_suggestions_product_id", ["productId"])
@Index("IDX_product_suggestions_product_variant_id", ["productVariantId"])
@Index("IDX_product_suggestions_post_id", ["postId"])
export class ProductSuggestion {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "product_variant_id", type: "int", nullable: true })
  productVariantId: number | null;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "product_variant_id" })
  productVariant: ProductVariant | null;

  @Column({ name: "conversation_id", type: "int" })
  conversationId: number;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation;

  @Column({ name: "post_id", type: "varchar", length: 255, nullable: true })
  postId: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
