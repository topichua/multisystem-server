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
import { AutomationDurationUnit } from "./automation-duration-unit.enum";
import { AutomationScheduledJobStatus } from "./automation-scheduled-job-status.enum";
import { AutomationSourceType } from "./automation-source-type.enum";
import { OrderStatusAutomation } from "./order-status-automation.entity";

@Entity("order_status_automation_scheduled_jobs")
@Index(
  "UQ_automation_scheduled_jobs_idempotency",
  ["automationId", "orderId", "idempotencyKey"],
  { unique: true },
)
@Index("IDX_automation_scheduled_jobs_due", ["status", "runAt"])
@Index("IDX_automation_scheduled_jobs_workspace_status", [
  "workspaceId",
  "status",
  "runAt",
])
export class OrderStatusAutomationScheduledJob {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @Column({ name: "automation_id", type: "int" })
  automationId: number;

  @ManyToOne(() => OrderStatusAutomation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "automation_id" })
  automation: OrderStatusAutomation;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @Column({ name: "conversation_id", type: "int", nullable: true })
  conversationId: number | null;

  @Column({ name: "template_id", type: "int" })
  templateId: number;

  @Column({
    type: "enum",
    enum: AutomationScheduledJobStatus,
    enumName: "automation_scheduled_job_status_enum",
    default: AutomationScheduledJobStatus.pending,
  })
  status: AutomationScheduledJobStatus;

  /** When the message should be sent (after delay + optional business hours). */
  @Column({ name: "run_at", type: "timestamptz" })
  runAt: Date;

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

  @Column({ name: "automation_version", type: "int" })
  automationVersion: number;

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

  @Column({ name: "wait_for_business_hours", type: "boolean", default: false })
  waitForBusinessHours: boolean;

  @Column({ name: "cancel_reason", type: "varchar", length: 64, nullable: true })
  cancelReason: string | null;

  @Column({ name: "error_code", type: "varchar", length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "message_preview", type: "text", nullable: true })
  messagePreview: string | null;

  @Column({ name: "execution_id", type: "int", nullable: true })
  executionId: number | null;

  @Column({ name: "sent_at", type: "timestamptz", nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
