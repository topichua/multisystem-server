import { MigrationInterface, QueryRunner } from "typeorm";

export class PaymentIntegrations1744200000130 implements MigrationInterface {
  name = "PaymentIntegrations1744200000130";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "orders_payment_status_enum" ADD VALUE IF NOT EXISTS 'overpaid'
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_provider_enum" AS ENUM ('monobank')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_integration_status_enum" AS ENUM (
        'connected', 'disconnected', 'error'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_method_enum" AS ENUM ('online_payment')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_request_status_enum" AS ENUM (
        'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_transaction_type_enum" AS ENUM (
        'charge', 'refund', 'adjustment'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_transaction_status_enum" AS ENUM (
        'pending', 'succeeded', 'failed'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_transaction_source_enum" AS ENUM (
        'provider_webhook', 'manual', 'delivery', 'system'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_integrations" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "provider" "payment_provider_enum" NOT NULL,
        "display_name" character varying(120) NOT NULL,
        "status" "payment_integration_status_enum" NOT NULL DEFAULT 'disconnected',
        "is_default" boolean NOT NULL DEFAULT false,
        "credentials_encrypted" text,
        "last_connection_check_at" TIMESTAMPTZ,
        "last_error" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_integrations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_integrations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_integrations_workspace_id"
      ON "payment_integrations" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payment_integrations_workspace_provider"
      ON "payment_integrations" ("workspace_id", "provider")
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_requests" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "integration_id" integer NOT NULL,
        "method" "payment_method_enum" NOT NULL DEFAULT 'online_payment',
        "provider" "payment_provider_enum" NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL,
        "status" "payment_request_status_enum" NOT NULL DEFAULT 'pending',
        "external_payment_id" character varying(255),
        "payment_url" text,
        "expires_at" TIMESTAMPTZ,
        "paid_at" TIMESTAMPTZ,
        "failure_reason" text,
        "created_by_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_requests_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_requests_order"
          FOREIGN KEY ("workspace_id", "order_id")
          REFERENCES "orders"("workspace_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_requests_integration_id"
          FOREIGN KEY ("integration_id") REFERENCES "payment_integrations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_requests_created_by_id"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_requests_workspace_id"
      ON "payment_requests" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_requests_order_id"
      ON "payment_requests" ("workspace_id", "order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_requests_integration_id"
      ON "payment_requests" ("integration_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payment_requests_provider_external_payment_id"
      ON "payment_requests" ("provider", "external_payment_id")
      WHERE "external_payment_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_transactions" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "payment_id" integer NOT NULL,
        "provider" "payment_provider_enum" NOT NULL,
        "type" "payment_transaction_type_enum" NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL,
        "status" "payment_transaction_status_enum" NOT NULL DEFAULT 'succeeded',
        "source" "payment_transaction_source_enum" NOT NULL,
        "external_transaction_id" character varying(255),
        "confirmed_by_id" integer,
        "occurred_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_transactions_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_transactions_order"
          FOREIGN KEY ("workspace_id", "order_id")
          REFERENCES "orders"("workspace_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_transactions_payment_id"
          FOREIGN KEY ("payment_id") REFERENCES "payment_requests"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_transactions_confirmed_by_id"
          FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_transactions_workspace_id"
      ON "payment_transactions" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_transactions_order_id"
      ON "payment_transactions" ("workspace_id", "order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_transactions_payment_id"
      ON "payment_transactions" ("payment_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payment_transactions_provider_external_id"
      ON "payment_transactions" ("provider", "external_transaction_id")
      WHERE "external_transaction_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_integrations"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_transaction_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_transaction_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_transaction_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_request_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_integration_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_provider_enum"`);
  }
}
