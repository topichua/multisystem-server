import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoNovaPoshtaPayment1744200000161
  implements MigrationInterface
{
  name = "OrderDeliveryInfoNovaPoshtaPayment1744200000161";

  /** Enum ADD VALUE must commit before later statements can rely on the value. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "payment_transaction_source_enum"
      ADD VALUE IF NOT EXISTS 'nova_poshta_payment'
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN IF NOT EXISTS "payment_id" integer
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_order_delivery_infos_payment_id'
        ) THEN
          ALTER TABLE "order_delivery_infos"
          ADD CONSTRAINT "FK_order_delivery_infos_payment_id"
            FOREIGN KEY ("payment_id")
            REFERENCES "payment_transactions"("id")
            ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_delivery_infos_payment_id"
      ON "order_delivery_infos" ("payment_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_order_delivery_infos_payment_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP CONSTRAINT IF EXISTS "FK_order_delivery_infos_payment_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN IF EXISTS "payment_id"
    `);
    // PostgreSQL cannot remove enum values safely.
  }
}
