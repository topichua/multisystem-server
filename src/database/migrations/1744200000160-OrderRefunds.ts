import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderRefunds1744200000160 implements MigrationInterface {
  name = "OrderRefunds1744200000160";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "order_refund_status_enum" AS ENUM (
        'pending',
        'approved',
        'rejected',
        'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "order_refunds" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL,
        "status" "order_refund_status_enum" NOT NULL DEFAULT 'pending',
        "note" text,
        "created_by_id" integer NOT NULL,
        "reviewed_by_id" integer,
        "reviewed_at" TIMESTAMPTZ,
        "payment_transaction_id" integer,
        "occurred_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_refunds_workspace"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_order_refunds_order"
          FOREIGN KEY ("workspace_id", "order_id")
          REFERENCES "orders"("workspace_id", "id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_order_refunds_created_by"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_order_refunds_reviewed_by"
          FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_order_refunds_payment_transaction"
          FOREIGN KEY ("payment_transaction_id")
          REFERENCES "payment_transactions"("id")
          ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_refunds_workspace_id"
      ON "order_refunds" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_refunds_order_id"
      ON "order_refunds" ("workspace_id", "order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_refunds_status"
      ON "order_refunds" ("workspace_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_refunds"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "order_refund_status_enum"`);
  }
}
