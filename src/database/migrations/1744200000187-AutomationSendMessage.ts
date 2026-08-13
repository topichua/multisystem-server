import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * SEND_MESSAGE automation action: order template + optional action delay /
 * wait-for-business-hours, plus scheduled jobs table for deferred sends.
 */
export class AutomationSendMessage1744200000187 implements MigrationInterface {
  name = "AutomationSendMessage1744200000187";

  /** Enum ADD VALUE must not share a transaction with DDL that uses the value. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "automation_action_type_enum"
      ADD VALUE IF NOT EXISTS 'SEND_MESSAGE'
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN IF NOT EXISTS "target_template_id" integer
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_order_status_automations_target_template'
        ) THEN
          ALTER TABLE "order_status_automations"
          ADD CONSTRAINT "FK_order_status_automations_target_template"
          FOREIGN KEY ("target_template_id")
          REFERENCES "workspace_templates"("id")
          ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN IF NOT EXISTS "action_delay_value" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN IF NOT EXISTS "action_delay_unit" "automation_duration_unit_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN IF NOT EXISTS "wait_for_business_hours" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ADD COLUMN IF NOT EXISTS "target_template_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ADD COLUMN IF NOT EXISTS "conversation_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ADD COLUMN IF NOT EXISTS "message_preview" text
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "automation_scheduled_job_status_enum" AS ENUM (
          'PENDING', 'SENT', 'CANCELLED', 'FAILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_status_automation_scheduled_jobs" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "automation_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "conversation_id" integer,
        "template_id" integer NOT NULL,
        "status" "automation_scheduled_job_status_enum" NOT NULL DEFAULT 'PENDING',
        "run_at" TIMESTAMPTZ NOT NULL,
        "source_type" "automation_source_type_enum" NOT NULL,
        "source_status_snapshot" character varying(64) NOT NULL,
        "expected_status_changed_at" TIMESTAMPTZ,
        "idempotency_key" character varying(255) NOT NULL,
        "automation_name_snapshot" character varying(255) NOT NULL,
        "automation_version" integer NOT NULL,
        "action_delay_value" integer,
        "action_delay_unit" "automation_duration_unit_enum",
        "wait_for_business_hours" boolean NOT NULL DEFAULT false,
        "cancel_reason" character varying(64),
        "error_code" character varying(64),
        "error_message" text,
        "message_preview" text,
        "execution_id" integer,
        "sent_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_status_automation_scheduled_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_automation_scheduled_jobs_automation"
          FOREIGN KEY ("automation_id")
          REFERENCES "order_status_automations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "UQ_automation_scheduled_jobs_idempotency"
          UNIQUE ("automation_id", "order_id", "idempotency_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_scheduled_jobs_due"
      ON "order_status_automation_scheduled_jobs" ("status", "run_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_scheduled_jobs_workspace_status"
      ON "order_status_automation_scheduled_jobs" ("workspace_id", "status", "run_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "order_status_automation_scheduled_jobs"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "automation_scheduled_job_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      DROP COLUMN IF EXISTS "message_preview"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      DROP COLUMN IF EXISTS "conversation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      DROP COLUMN IF EXISTS "target_template_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN IF EXISTS "wait_for_business_hours"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN IF EXISTS "action_delay_unit"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN IF EXISTS "action_delay_value"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP CONSTRAINT IF EXISTS "FK_order_status_automations_target_template"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN IF EXISTS "target_template_id"
    `);
  }
}
