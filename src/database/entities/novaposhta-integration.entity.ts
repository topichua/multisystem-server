import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { NovaPoshtaPayerType } from "./novaposhta-payer-type.enum";
import { NovaPoshtaPaymentMethod } from "./novaposhta-payment-method.enum";
import { NovaPoshtaSenderType } from "./novaposhta-sender-type.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/** Nova Poshta API key and default sender settings per workspace. */
@Entity("novaposhta_integrations")
@Unique("UQ_novaposhta_integrations_workspace_id", ["workspaceId"])
@Index("IDX_novaposhta_integrations_workspace_id", ["workspaceId"])
@Index("IDX_novaposhta_integrations_owner_id", ["ownerId"])
export class NovaPoshtaIntegration {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "workspace_id", type: "int" })
  workspaceId: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ name: "owner_id", type: "int" })
  ownerId: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_id" })
  owner: User;

  @Column({ name: "name", type: "varchar", length: 255, default: "Nova Poshta" })
  name: string;

  @Column({ name: "api_key", type: "text" })
  apiKey: string;

  @Column({ name: "sender_name", type: "varchar", length: 255, nullable: true })
  senderName: string | null;

  @Column({ name: "sender_phone", type: "varchar", length: 64, nullable: true })
  senderPhone: string | null;

  @Column({ name: "sender_city_ref", type: "varchar", length: 255, nullable: true })
  senderCityRef: string | null;

  @Column({ name: "sender_city_name", type: "varchar", length: 255, nullable: true })
  senderCityName: string | null;

  @Column({ name: "sender_type", type: "varchar", length: 32, nullable: true })
  senderType: NovaPoshtaSenderType | null;

  @Column({
    name: "sender_warehouse_ref",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  senderWarehouseRef: string | null;

  @Column({
    name: "sender_warehouse_name",
    type: "varchar",
    length: 512,
    nullable: true,
  })
  senderWarehouseName: string | null;

  @Column({ name: "sender_street_ref", type: "varchar", length: 255, nullable: true })
  senderStreetRef: string | null;

  @Column({ name: "sender_street_name", type: "varchar", length: 255, nullable: true })
  senderStreetName: string | null;

  @Column({ name: "sender_building", type: "varchar", length: 64, nullable: true })
  senderBuilding: string | null;

  @Column({ name: "sender_flat", type: "varchar", length: 64, nullable: true })
  senderFlat: string | null;

  /** Nova Poshta Counterparty Ref. */
  @Column({ name: "sender_ref", type: "varchar", length: 255, nullable: true })
  senderRef: string | null;

  /** Nova Poshta ContactPerson Ref. */
  @Column({
    name: "sender_contact_ref",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  senderContactRef: string | null;

  @Column({ name: "payment_method", type: "varchar", length: 32, nullable: true })
  paymentMethod: NovaPoshtaPaymentMethod | null;

  @Column({ name: "payer_type", type: "varchar", length: 32, nullable: true })
  payerType: NovaPoshtaPayerType | null;

  @Column({ name: "connected_at", type: "timestamptz" })
  connectedAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
