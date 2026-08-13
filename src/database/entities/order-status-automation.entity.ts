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
import { AutomationConditionType } from "./automation-condition-type.enum";
import { AutomationDurationUnit } from "./automation-duration-unit.enum";
import { AutomationOrigin } from "./automation-origin.enum";
import { ConversationGroup } from "./conversation-group.entity";
import { OrderStatus } from "./order-status.entity";
import { OrderStatusAutomationCondition } from "./order-status-automation-condition.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";
import { WorkspaceTemplate } from "../../workspace-templates/workspace-template.entity";

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

  /** How `conditions` combine: OR = any match; AND = all must match. */
  @Column({
    name: "condition_type",
    type: "enum",
    enum: AutomationConditionType,
    enumName: "automation_condition_type_enum",
    default: AutomationConditionType.or,
  })
  conditionType: AutomationConditionType;

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

  /** Required when actionType is CHANGE_ORDER_STATUS. */
  @Column({ name: "target_order_status_id", type: "int", nullable: true })
  targetOrderStatusId: number | null;

  @ManyToOne(() => OrderStatus, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "target_order_status_id" })
  targetOrderStatus: OrderStatus | null;

  /** Required when actionType is CHANGE_CONVERSATION_GROUP. */
  @Column({
    name: "target_conversation_group_id",
    type: "int",
    nullable: true,
  })
  targetConversationGroupId: number | null;

  @ManyToOne(() => ConversationGroup, {
    onDelete: "RESTRICT",
    nullable: true,
  })
  @JoinColumn({ name: "target_conversation_group_id" })
  targetConversationGroup: ConversationGroup | null;

  /** Required when actionType is SEND_MESSAGE (order template). */
  @Column({ name: "target_template_id", type: "int", nullable: true })
  targetTemplateId: number | null;

  @ManyToOne(() => WorkspaceTemplate, {
    onDelete: "RESTRICT",
    nullable: true,
  })
  @JoinColumn({ name: "target_template_id" })
  targetTemplate: WorkspaceTemplate | null;

  /**
   * Optional delay after conditions match before SEND_MESSAGE runs.
   * Null = no action delay (still may wait for business hours).
   */
  @Column({ name: "action_delay_value", type: "int", nullable: true })
  actionDelayValue: number | null;

  @Column({
    name: "action_delay_unit",
    type: "enum",
    enum: AutomationDurationUnit,
    enumName: "automation_duration_unit_enum",
    nullable: true,
  })
  actionDelayUnit: AutomationDurationUnit | null;

  /** When true, SEND_MESSAGE waits until workspace work schedule. */
  @Column({
    name: "wait_for_business_hours",
    type: "boolean",
    default: false,
  })
  waitForBusinessHours: boolean;

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
