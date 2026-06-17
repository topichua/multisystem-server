import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WebhookEventStatus } from "./webhook-event-status.enum";

@Entity("webhook_events")
@Index("IDX_webhook_events_provider", ["provider"])
@Index("IDX_webhook_events_status", ["status"])
@Index("IDX_webhook_events_provider_event_key", ["provider", "eventKey"])
export class WebhookEvent {
  @PrimaryGeneratedColumn({ name: "id" })
  id: number;

  @Column({ name: "provider", type: "varchar", length: 64 })
  provider: string;

  @Column({ name: "event_key", type: "varchar", length: 255 })
  eventKey: string;

  @Column({ name: "raw_payload", type: "jsonb" })
  rawPayload: Record<string, unknown>;

  @Column({
    name: "status",
    type: "enum",
    enum: WebhookEventStatus,
    enumName: "webhook_events_status_enum",
    default: WebhookEventStatus.PENDING,
  })
  status: WebhookEventStatus;

  @Column({ name: "attempts", type: "int", default: 0 })
  attempts: number;

  @Column({
    name: "received_at",
    type: "timestamptz",
    default: () => "now()",
  })
  receivedAt: Date;

  @Column({ name: "queued_at", type: "timestamptz", nullable: true })
  queuedAt: Date | null;

  @Column({ name: "processing_at", type: "timestamptz", nullable: true })
  processingAt: Date | null;

  @Column({ name: "processed_at", type: "timestamptz", nullable: true })
  processedAt: Date | null;

  @Column({ name: "error", type: "text", nullable: true })
  error: string | null;
}
