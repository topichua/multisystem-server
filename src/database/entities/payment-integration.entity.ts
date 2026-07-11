import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Workspace } from "./workspace.entity";
import { PaymentProvider } from "./payment-provider.enum";
import { PaymentIntegrationStatus } from "./payment-integration-status.enum";
import { PaymentRequest } from "./payment-request.entity";

@Entity("payment_integrations")
@Index("IDX_payment_integrations_workspace_id", ["workspaceId"])
@Index("UQ_payment_integrations_workspace_provider", ["workspaceId", "provider"], {
  unique: true,
})
export class PaymentIntegration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({
    type: "enum",
    enum: PaymentProvider,
    enumName: "payment_provider_enum",
  })
  provider: PaymentProvider;

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName: string;

  @Column({
    type: "enum",
    enum: PaymentIntegrationStatus,
    enumName: "payment_integration_status_enum",
    default: PaymentIntegrationStatus.disconnected,
  })
  status: PaymentIntegrationStatus;

  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault: boolean;

  @Column({ name: "credentials_encrypted", type: "text", nullable: true })
  credentialsEncrypted: string | null;

  @Column({ name: "last_connection_check_at", type: "timestamptz", nullable: true })
  lastConnectionCheckAt: Date | null;

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @OneToMany(() => PaymentRequest, (p) => p.integration)
  paymentRequests: PaymentRequest[];
}
