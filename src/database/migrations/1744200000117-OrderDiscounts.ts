import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDiscounts1744200000117 implements MigrationInterface {
  name = "OrderDiscounts1744200000117";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "discount_amount" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "discount_amount" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP COLUMN IF EXISTS "discount_percent",
      DROP COLUMN IF EXISTS "discount_amount"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "discount_percent",
      DROP COLUMN IF EXISTS "discount_amount"
    `);
  }
}
