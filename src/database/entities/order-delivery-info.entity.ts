import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Order } from "./order.entity";
import { OrderDeliveryProvider } from "./order-delivery-provider.enum";

@Entity("order_delivery_infos")
@Unique("UQ_order_delivery_infos_order_id", ["orderId"])
export class OrderDeliveryInfo {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @ManyToOne(() => Order, (o) => o.deliveryInfos, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({
    type: "enum",
    enum: OrderDeliveryProvider,
    enumName: "order_delivery_provider_enum",
  })
  provider: OrderDeliveryProvider;

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

  @Column({ name: "address", type: "text", nullable: true })
  address: string | null;

  @Column({
    name: "tracking_number",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  trackingNumber: string | null;

  @Column({ name: "raw_provider_payload", type: "jsonb", nullable: true })
  rawProviderPayload: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
