import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Client } from "./client.entity";
import { ProductVariant } from "./product-variant.entity";
import { Product } from "./product.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity({ name: "client_wishlist_items" })
@Unique("UQ_client_wishlist_items_client_product_variant", [
  "clientId",
  "productId",
  "variantId",
])
@Index("IDX_client_wishlist_items_client_id", ["clientId"])
@Index("IDX_client_wishlist_items_workspace_id", ["workspaceId"])
@Index("IDX_client_wishlist_items_conversation_id", ["conversationId"])
@Index("IDX_client_wishlist_items_workspace_id_at", ["workspaceId", "at"])
@Index("IDX_client_wishlist_items_workspace_id_variant_id", [
  "workspaceId",
  "variantId",
])
export class ClientWishlistItem {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "client_id", type: "int" })
  clientId: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "product_id", type: "int" })
  productId: number;

  @Column({ name: "variant_id", type: "int" })
  variantId: number;

  @Column({ name: "at", type: "timestamptz" })
  at: Date;

  @Column({ name: "created_by_id", type: "int" })
  createdById: number;

  @Column({ name: "conversation_id", type: "int", nullable: true })
  conversationId: number | null;

  @ManyToOne(() => Client, { onDelete: "CASCADE" })
  @JoinColumn({ name: "client_id" })
  client: Client;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variant_id" })
  variant: ProductVariant;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;
}
