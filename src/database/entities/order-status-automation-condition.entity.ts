import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AutomationSourceType } from "./automation-source-type.enum";
import { OrderStatusAutomation } from "./order-status-automation.entity";

@Entity("order_status_automation_conditions")
@Index("IDX_order_status_automation_conditions_lookup", [
  "sourceType",
  "sourceStatus",
])
@Index(
  "UQ_order_status_automation_conditions_automation_source",
  ["automationId", "sourceType", "sourceStatus"],
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

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;
}
