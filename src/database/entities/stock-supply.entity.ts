import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { StockMovement } from "./stock-movement.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity({ name: "stock_supplies" })
@Index("IDX_stock_supplies_workspace_id", ["workspaceId"])
@Index("IDX_stock_supplies_created_at", ["createdAt"])
export class StockSupply {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "user_id", type: "int", nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: User | null;

  @Column({ type: "text", nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @OneToMany(() => StockMovement, (movement) => movement.supply)
  movements: StockMovement[];
}
