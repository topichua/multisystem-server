import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AutomationConditionOperator } from "./automation-condition-operator.enum";
import { AutomationDurationUnit } from "./automation-duration-unit.enum";
import { AutomationSourceType } from "./automation-source-type.enum";
import { OrderStatusAutomation } from "./order-status-automation.entity";

@Entity("order_status_automation_conditions")
@Index("IDX_order_status_automation_conditions_lookup", [
  "sourceType",
  "sourceStatus",
  "operator",
])
@Index(
  "UQ_order_status_automation_conditions_automation_source_op",
  ["automationId", "sourceType", "sourceStatus", "operator"],
  { unique: true },
)
export class OrderStatusAutomationCondition {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "automation_id", type: "int" })
  automationId: number;

  @ManyToOne(() => OrderStatusAutomation, (automation) => automation.conditions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "automation_id" })
  automation: OrderStatusAutomation;

  @Column({
    name: "source_type",
    type: "enum",
    enum: AutomationSourceType,
    enumName: "automation_source_type_enum",
  })
  sourceType: AutomationSourceType;

  /** OrderDeliveryStatus or OrderPaymentStatus code as string. */
  @Column({ name: "source_status", type: "varchar", length: 64 })
  sourceStatus: string;

  /**
   * `EQ` — status equals `sourceStatus` (default).
   * `NEQ` — status is anything except `sourceStatus`.
   */
  @Column({
    name: "operator",
    type: "enum",
    enum: AutomationConditionOperator,
    enumName: "automation_condition_operator_enum",
    default: AutomationConditionOperator.eq,
  })
  operator: AutomationConditionOperator;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "duration_value", type: "int", nullable: true })
  durationValue: number | null;

  @Column({
    name: "duration_unit",
    type: "enum",
    enum: AutomationDurationUnit,
    enumName: "automation_duration_unit_enum",
    nullable: true,
  })
  durationUnit: AutomationDurationUnit | null;
}
