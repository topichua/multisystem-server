import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Order } from "./order.entity";
import { User } from "./user.entity";

/** Append-only audit trail for an order. */
@Entity("order_events")
@Index("IDX_order_events_order_id", ["orderId"])
export class OrderEvent {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "order_id", type: "int" })
  orderId: number;

  @ManyToOne(() => Order, (o) => o.events, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ name: "type", type: "varchar", length: 64 })
  type: string;

  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "actor_id" })
  actor: User | null;

  @Column({ name: "payload", type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
