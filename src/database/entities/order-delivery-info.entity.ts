import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { NovaPoshtaPayerType } from "./novaposhta-payer-type.enum";
import { OrderDeliveryDestinationType } from "./order-delivery-destination-type.enum";
import { OrderDeliveryProvider } from "./order-delivery-provider.enum";
import { OrderDeliveryStatus } from "./order-delivery-status.enum";
import { PaymentTransaction } from "./payment-transaction.entity";

@Entity("order_delivery_infos")
export class OrderDeliveryInfo {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({
    type: "enum",
    enum: OrderDeliveryProvider,
    enumName: "order_delivery_provider_enum",
  })
  provider: OrderDeliveryProvider;

  @Column({ name: "provider_id", type: "int", nullable: true })
  providerId: number | null;

  @Column({
    name: "delivery_status",
    type: "enum",
    enum: OrderDeliveryStatus,
    enumName: "orders_delivery_status_enum",
    default: OrderDeliveryStatus.pending,
  })
  deliveryStatus: OrderDeliveryStatus;

  @Column({
    name: "recipient_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  recipientName: string | null;

  @Column({ name: "phone", type: "varchar", length: 64, nullable: true })
  phone: string | null;

  @Column({ name: "city", type: "varchar", length: 255, nullable: true })
  city: string | null;

  @Column({ name: "city_ref", type: "varchar", length: 255, nullable: true })
  cityRef: string | null;

  @Column({ name: "warehouse", type: "varchar", length: 255, nullable: true })
  warehouse: string | null;

  @Column({
    name: "warehouse_ref",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  warehouseRef: string | null;

  @Column({
    name: "delivery_type",
    type: "enum",
    enum: OrderDeliveryDestinationType,
    enumName: "order_delivery_destination_type_enum",
    nullable: true,
  })
  deliveryType: OrderDeliveryDestinationType | null;

  @Column({ name: "street", type: "varchar", length: 255, nullable: true })
  street: string | null;

  @Column({ name: "street_ref", type: "varchar", length: 255, nullable: true })
  streetRef: string | null;

  @Column({ name: "building", type: "varchar", length: 64, nullable: true })
  building: string | null;

  @Column({ name: "flat", type: "varchar", length: 64, nullable: true })
  flat: string | null;

  @Column({
    name: "tracking_number",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  trackingNumber: string | null;

  @Column({
    name: "provider_status_code",
    type: "varchar",
    length: 32,
    nullable: true,
  })
  providerStatusCode: string | null;

  /** When the current `deliveryStatus` value was set (not `updatedAt`). */
  @Column({
    name: "delivery_status_at",
    type: "timestamptz",
    nullable: true,
  })
  deliveryStatusAt: Date | null;

  @Column({
    name: "provider_status_text",
    type: "varchar",
    length: 512,
    nullable: true,
  })
  providerStatusText: string | null;

  @Column({
    name: "provider_document_ref",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  providerDocumentRef: string | null;

  @Column({ name: "is_cash_on_delivery", type: "boolean", default: false })
  isCashOnDelivery: boolean;

  @Column({
    name: "cash_on_delivery_amount",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  cashOnDeliveryAmount: number | null;

  /** Who pays delivery (Nova Poshta PayerType). Set from request / integration when TTN is created. */
  @Column({ name: "payer_type", type: "varchar", length: 32, nullable: true })
  payerType: NovaPoshtaPayerType | null;

  /** Calculated shipping cost from carrier after TTN creation (e.g. Nova Poshta CostOnSite). */
  @Column({
    name: "delivery_price",
    type: "decimal",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  deliveryPrice: number | null;

  /** True when delivery was created/replaced via manual tracking number lookup. */
  @Column({
    name: "synced_from_tracking_manually",
    type: "boolean",
    default: false,
  })
  syncedFromTrackingManually: boolean;

  /**
   * Linked Nova Poshta COD payment transaction (`nova_poshta_payment` source).
   * Optional until COD payment is created for this delivery.
   */
  @Column({ name: "payment_id", type: "int", nullable: true })
  paymentId: number | null;

  @ManyToOne(() => PaymentTransaction, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "payment_id" })
  payment: PaymentTransaction | null;

  /**
   * Hydrated API alias of `paymentId` (COD payment linked on delivery).
   * Not a separate DB column.
   */
  syncedPaymentId?: number | null;

  /** Hydrated: true when TTN can be deleted via API (before `shipped`). Not a DB column. */
  canRemoveTracking?: boolean;

  /**
   * Hydrated: true when COD amount is set and TTN exists
   * (eligible for delivery COD payment sync). Not a DB column.
   */
  canSyncPayment?: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
