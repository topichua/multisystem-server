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
import { Product } from "./product.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity("product_categories")
@Index("IDX_product_categories_workspace_id", ["workspaceId"])
@Index("IDX_product_categories_parent_id", ["parentId"])
@Index("IDX_product_categories_deleted_at", ["deletedAt"])
export class ProductCategory {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "name", type: "varchar", length: 80 })
  name: string;

  @Column({ name: "parent_id", type: "int", nullable: true })
  parentId: number | null;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "created_by_user_id", type: "int" })
  createdByUserId: number;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date | null;

  @Column({ name: "deleted_by_user_id", type: "int", nullable: true })
  deletedByUserId: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @ManyToOne(() => Workspace, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "parent_id" })
  parent: ProductCategory | null;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User;

  @ManyToOne(() => User, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "deleted_by_user_id" })
  deletedByUser: User | null;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
