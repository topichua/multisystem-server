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
import { StockSupplyItem } from "./stock-supply-item.entity";
import {
  STOCK_SUPPLY_STATUSES,
  type StockSupplyStatus,
} from "./stock-supply-status";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity({ name: "stock_supplies" })
@Index("IDX_stock_supplies_workspace_id", ["workspaceId"])
@Index("IDX_stock_supplies_created_at", ["createdAt"])
@Index("IDX_stock_supplies_workspace_status", ["workspaceId", "status"])
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

  @Column({ name: "name", type: "varchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "text", nullable: true })
  comment: string | null;

  @Column({
    name: "status",
    type: "varchar",
    length: 16,
    default: "applied",
  })
  status: StockSupplyStatus;

  @Column({ name: "applied_at", type: "timestamptz", nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @OneToMany(() => StockSupplyItem, (item) => item.supply)
  items: StockSupplyItem[];

  @OneToMany(() => StockMovement, (movement) => movement.supply)
  movements: StockMovement[];
}

export { STOCK_SUPPLY_STATUSES, type StockSupplyStatus };
