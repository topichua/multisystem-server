import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusAutomations1744200000134 implements MigrationInterface {
  name = "OrderStatusAutomations1744200000134";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "automation_source_type_enum" AS ENUM (
        'DELIVERY_STATUS',
        'PAYMENT_STATUS'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "automation_action_type_enum" AS ENUM (
        'CHANGE_ORDER_STATUS'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "automation_duration_unit_enum" AS ENUM (
        'MINUTES',
        'HOURS',
        'DAYS'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "automation_origin_enum" AS ENUM (
        'USER',
        'MULTISALE_TEMPLATE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "automation_execution_status_enum" AS ENUM (
        'APPLIED',
        'SKIPPED',
        'FAILED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "payment_status_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      UPDATE "orders"
      SET "payment_status_at" = COALESCE("paid_at", "updated_at", "created_at")
      WHERE "payment_status" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "order_status_automations" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "source_type" "automation_source_type_enum" NOT NULL,
        "source_status" character varying(64) NOT NULL,
        "duration_value" integer,
        "duration_unit" "automation_duration_unit_enum",
        "action_type" "automation_action_type_enum" NOT NULL DEFAULT 'CHANGE_ORDER_STATUS',
        "target_order_status_id" integer NOT NULL,
        "origin" "automation_origin_enum" NOT NULL DEFAULT 'USER',
        "template_key" character varying(128),
        "created_by_id" integer,
        "updated_by_id" integer,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_order_status_automations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_status_automations_workspace"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_status_automations_target_status"
          FOREIGN KEY ("target_order_status_id") REFERENCES "order_statuses"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_order_status_automations_created_by"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_order_status_automations_updated_by"
          FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_order_status_automations_duration_pair"
          CHECK (
            ("duration_value" IS NULL AND "duration_unit" IS NULL)
            OR ("duration_value" IS NOT NULL AND "duration_unit" IS NOT NULL AND "duration_value" > 0)
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_status_automations_workspace_active"
      ON "order_status_automations" ("workspace_id", "is_active")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "order_status_automation_executions" (
        "id" SERIAL NOT NULL,
        "automation_id" integer NOT NULL,
        "workspace_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "status" "automation_execution_status_enum" NOT NULL,
        "reason" character varying(64),
        "previous_order_status_id" integer,
        "target_order_status_id" integer NOT NULL,
        "source_type" "automation_source_type_enum" NOT NULL,
        "source_status_snapshot" character varying(64) NOT NULL,
        "expected_status_changed_at" TIMESTAMPTZ,
        "idempotency_key" character varying(255) NOT NULL,
        "automation_name_snapshot" character varying(255) NOT NULL,
        "duration_value" integer,
        "duration_unit" character varying(16),
        "error_code" character varying(64),
        "error_message" text,
        "executed_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_status_automation_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_status_automation_executions_automation"
          FOREIGN KEY ("automation_id") REFERENCES "order_status_automations"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_order_status_automation_executions_idempotency"
          UNIQUE ("automation_id", "order_id", "idempotency_key")
      )
    `);

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_status_automation_executions"`);
    await queryRunner.query(`DROP TABLE "order_status_automations"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "payment_status_at"`);
    await queryRunner.query(`DROP TYPE "automation_execution_status_enum"`);
    await queryRunner.query(`DROP TYPE "automation_origin_enum"`);
    await queryRunner.query(`DROP TYPE "automation_duration_unit_enum"`);
    await queryRunner.query(`DROP TYPE "automation_action_type_enum"`);
    await queryRunner.query(`DROP TYPE "automation_source_type_enum"`);
  }
}
