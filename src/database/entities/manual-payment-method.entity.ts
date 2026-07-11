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
import { ManualPaymentMethodType } from "./manual-payment-method-type.enum";
import { Workspace } from "./workspace.entity";

@Entity("manual_payment_methods")
@Index("IDX_manual_payment_methods_workspace_id", ["workspaceId"])
export class ManualPaymentMethod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ type: "varchar", length: 120 })
  name: string;

  @Column({
    type: "enum",
    enum: ManualPaymentMethodType,
    enumName: "manual_payment_method_type_enum",
  })
  type: ManualPaymentMethodType;

  @Column({ type: "varchar", length: 64 })
  value: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
