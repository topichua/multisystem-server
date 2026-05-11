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
import { Workspace } from "./workspace.entity";
import { OrderStatusCategory } from "./order-status-category.enum";

@Entity("order_statuses")
@Index("IDX_order_statuses_workspace_id", ["workspaceId"])
export class OrderStatus {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "name", type: "varchar", length: 120 })
  name: string;

  @Column({
    type: "enum",
    enum: OrderStatusCategory,
    enumName: "order_statuses_category_enum",
  })
  category: OrderStatusCategory;

  @Column({ name: "color", type: "varchar", length: 32, nullable: true })
  color: string | null;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
