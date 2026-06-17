import { MigrationInterface, QueryRunner } from "typeorm";

export class WebhookEvents1744200000073 implements MigrationInterface {
  name = "WebhookEvents1744200000073";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "webhook_events_status_enum" AS ENUM (
        'pending',
        'queued',
        'processing',
        'processed',
        'failed'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" SERIAL NOT NULL,
        "provider" character varying(64) NOT NULL,
        "event_key" character varying(255) NOT NULL,
        "raw_payload" jsonb NOT NULL,
        "status" "webhook_events_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "queued_at" TIMESTAMPTZ,
        "processing_at" TIMESTAMPTZ,
        "processed_at" TIMESTAMPTZ,
        "error" text,
        CONSTRAINT "PK_webhook_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_provider" ON "webhook_events" ("provider")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_status" ON "webhook_events" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_provider_event_key" ON "webhook_events" ("provider", "event_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_events"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "webhook_events_status_enum"`,
    );
  }
}
