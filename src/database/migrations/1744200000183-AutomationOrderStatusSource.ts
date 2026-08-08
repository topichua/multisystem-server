import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ORDER_STATUS condition source + orders.status_changed_at for timed/immediate order-status rules.
 */
export class AutomationOrderStatusSource1744200000183
  implements MigrationInterface
{
  name = "AutomationOrderStatusSource1744200000183";

  /** Enum ADD VALUE must not share a transaction with later DDL that uses the value. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "automation_source_type_enum"
      ADD VALUE IF NOT EXISTS 'ORDER_STATUS'
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE "orders"
      SET "status_changed_at" = COALESCE("updated_at", "created_at")
      WHERE "status_changed_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_workspace_status_changed"
      ON "orders" ("workspace_id", "status_id", "status_changed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_orders_workspace_status_changed"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "status_changed_at"
    `);
    // Enum value ORDER_STATUS cannot be removed safely.
  }
}
