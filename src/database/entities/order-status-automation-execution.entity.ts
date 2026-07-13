import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AutomationExecutionStatus } from "./automation-execution-status.enum";
import { AutomationSourceType } from "./automation-source-type.enum";
import { OrderStatusAutomation } from "./order-status-automation.entity";

@Entity("order_status_automation_executions")
@Index(
  "UQ_order_status_automation_executions_idempotency",
  ["automationId", "orderId", "idempotencyKey"],
  { unique: true },
)
export class OrderStatusAutomationExecution {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "automation_id", type: "int" })
  automationId: number;

  @ManyToOne(() => OrderStatusAutomation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "automation_id" })
  automation: OrderStatusAutomation;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @Column({
    type: "enum",
    enum: AutomationExecutionStatus,
    enumName: "automation_execution_status_enum",
  })
  status: AutomationExecutionStatus;

  @Column({ type: "varchar", length: 64, nullable: true })
  reason: string | null;

  @Column({ name: "previous_order_status_id", type: "int", nullable: true })
  previousOrderStatusId: number | null;

  @Column({ name: "target_order_status_id", type: "int" })
  targetOrderStatusId: number;

  @Column({
    name: "source_type",
    type: "enum",
    enum: AutomationSourceType,
    enumName: "automation_source_type_enum",
  })
  sourceType: AutomationSourceType;

  @Column({ name: "source_status_snapshot", type: "varchar", length: 64 })
  sourceStatusSnapshot: string;

  @Column({
    name: "expected_status_changed_at",
    type: "timestamptz",
    nullable: true,
  })
  expectedStatusChangedAt: Date | null;

  @Column({ name: "idempotency_key", type: "varchar", length: 255 })
  idempotencyKey: string;

  @Column({ name: "automation_name_snapshot", type: "varchar", length: 255 })
  automationNameSnapshot: string;

  @Column({ name: "duration_value", type: "int", nullable: true })
  durationValue: number | null;

  @Column({
    name: "duration_unit",
    type: "varchar",
    length: 16,
    nullable: true,
  })
  durationUnit: string | null;

  @Column({ name: "error_code", type: "varchar", length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "executed_at", type: "timestamptz" })
  executedAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
