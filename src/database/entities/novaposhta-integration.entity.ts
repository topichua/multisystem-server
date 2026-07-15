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
import { NovaPoshtaCodCommissionPayer } from "./novaposhta-cod-commission-payer.enum";
import { NovaPoshtaDeliveryType } from "./novaposhta-delivery-type.enum";
import { NovaPoshtaPayerType } from "./novaposhta-payer-type.enum";
import { NovaPoshtaPaymentMethod } from "./novaposhta-payment-method.enum";
import { NovaPoshtaSenderType } from "./novaposhta-sender-type.enum";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/** Nova Poshta API key and default sender settings per workspace integration row. */
@Entity("novaposhta_integrations")
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

  @Column({
    name: "name",
    type: "varchar",
    length: 255,
    default: "Nova Poshta",
  })
  name: string;

  @Column({ name: "api_key", type: "text" })
  apiKey: string;

  @Column({ name: "sender_name", type: "varchar", length: 255, nullable: true })
  senderName: string | null;

  @Column({ name: "sender_phone", type: "varchar", length: 64, nullable: true })
  senderPhone: string | null;

  @Column({
    name: "sender_city_ref",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  senderCityRef: string | null;

  @Column({
    name: "sender_city_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
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

  @Column({
    name: "sender_street_ref",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  senderStreetRef: string | null;

  @Column({
    name: "sender_street_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  senderStreetName: string | null;

  @Column({
    name: "sender_building",
    type: "varchar",
    length: 64,
    nullable: true,
  })
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

  @Column({
    name: "payment_method",
    type: "varchar",
    length: 32,
    nullable: true,
  })
  paymentMethod: NovaPoshtaPaymentMethod | null;

  @Column({ name: "payer_type", type: "varchar", length: 32, nullable: true })
  payerType: NovaPoshtaPayerType | null;

  /** Nova Poshta waybill `CargoType` (Тип відправлення). */
  @Column({ name: "delivery_type", type: "varchar", length: 32, nullable: true })
  deliveryType: NovaPoshtaDeliveryType | null;

  /**
   * COD commission payer («Платник комісії післяплати»).
   * Used as `BackwardDeliveryData[].PayerType` when creating a waybill with cash on delivery.
   */
  @Column({
    name: "cod_commission_payer",
    type: "varchar",
    length: 32,
    nullable: true,
  })
  codCommissionPayer: NovaPoshtaCodCommissionPayer | null;

  /** Optional default parcel weight in kg (UI: Вага). */
  @Column({
    name: "default_weight_kg",
    type: "decimal",
    precision: 8,
    scale: 3,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  defaultWeightKg: number | null;

  /** Optional default parcel width in cm (UI: Ширина). */
  @Column({
    name: "default_width_cm",
    type: "decimal",
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  defaultWidthCm: number | null;

  /** Optional default parcel height in cm (UI: Висота). */
  @Column({
    name: "default_height_cm",
    type: "decimal",
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  defaultHeightCm: number | null;

  /** Optional default parcel length in cm (UI: Довжина). */
  @Column({
    name: "default_length_cm",
    type: "decimal",
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  defaultLengthCm: number | null;

  /** Призначення платежу — sent as AdditionalInformation on waybill create. */
  @Column({
    name: "payment_purpose",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  paymentPurpose: string | null;

  /** Default cargo description (Description) when creating a waybill. */
  @Column({
    name: "default_delivery_description",
    type: "varchar",
    length: 512,
    nullable: true,
  })
  defaultDeliveryDescription: string | null;

  /** Fixed declared parcel value when `estimatedDeliveryPriceTakeFromOrder` is false. */
  @Column({
    name: "estimated_delivery_price_fixed",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  estimatedDeliveryPriceFixed: number | null;

  /** When true, declared value comes from order total on waybill create. */
  @Column({
    name: "estimated_delivery_price_take_from_order",
    type: "boolean",
    default: true,
  })
  estimatedDeliveryPriceTakeFromOrder: boolean;

  @Column({ name: "connected_at", type: "timestamptz" })
  connectedAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
