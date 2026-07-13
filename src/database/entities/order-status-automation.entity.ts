import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from "typeorm";
import { AutomationActionType } from "./automation-action-type.enum";
import { AutomationOrigin } from "./automation-origin.enum";
import { OrderStatus } from "./order-status.entity";
import { OrderStatusAutomationCondition } from "./order-status-automation-condition.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

@Entity("order_status_automations")
@Index("IDX_order_status_automations_workspace_active", [
  "workspaceId",
  "isActive",
])
export class OrderStatusAutomation {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @OneToMany(
    () => OrderStatusAutomationCondition,
    (condition) => condition.automation,
    { cascade: true },
  )
  conditions: OrderStatusAutomationCondition[];

  @Column({
    name: "action_type",
    type: "enum",
    enum: AutomationActionType,
    enumName: "automation_action_type_enum",
    default: AutomationActionType.change_order_status,
  })
  actionType: AutomationActionType;

  @Column({ name: "target_order_status_id", type: "int" })
  targetOrderStatusId: number;

  @ManyToOne(() => OrderStatus, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "target_order_status_id" })
  targetOrderStatus: OrderStatus;

  @Column({
    name: "origin",
    type: "enum",
    enum: AutomationOrigin,
    enumName: "automation_origin_enum",
    default: AutomationOrigin.user,
  })
  origin: AutomationOrigin;

  @Column({
    name: "template_key",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  templateKey: string | null;

  @Column({ name: "created_by_id", type: "int", nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User | null;

  @Column({ name: "updated_by_id", type: "int", nullable: true })
  updatedById: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_id" })
  updatedBy: User | null;

  @VersionColumn({ name: "version", default: 1 })
  version: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date | null;
}
