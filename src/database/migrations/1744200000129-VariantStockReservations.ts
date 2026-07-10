import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantStockReservations1744200000129 implements MigrationInterface {
  name = "VariantStockReservations1744200000129";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      ADD COLUMN "reserved_quantity" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN "stock_reserved_at" TIMESTAMPTZ,
      ADD COLUMN "stock_released_at" TIMESTAMPTZ,
      ADD COLUMN "stock_returned_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TYPE "stock_movement_type_enum"
      ADD VALUE IF NOT EXISTS 'order_reserve'
    `);
    await queryRunner.query(`
      ALTER TYPE "stock_movement_type_enum"
      ADD VALUE IF NOT EXISTS 'order_release'
    `);

    await queryRunner.query(`
      ALTER TYPE "order_statuses_category_enum"
      ADD VALUE IF NOT EXISTS 'returned'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "order_statuses"
      WHERE "category" = 'returned'::order_statuses_category_enum
        AND "is_system" = true
    `);

    await queryRunner.query(`
      DELETE FROM "stock_movements"
      WHERE "type" IN ('order_reserve', 'order_release')
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP COLUMN IF EXISTS "stock_returned_at",
      DROP COLUMN IF EXISTS "stock_released_at",
      DROP COLUMN IF EXISTS "stock_reserved_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      DROP COLUMN IF EXISTS "reserved_quantity"
    `);

    await queryRunner.query(`
      CREATE TYPE "stock_movement_type_enum_new" AS ENUM (
        'initial_stock',
        'purchase',
        'order_sale',
        'order_cancel',
        'return',
        'correction',
        'inventory',
        'simple_adjustment',
        'simple_order_sale',
        'simple_order_cancel',
        'supply'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ALTER COLUMN "type" TYPE "stock_movement_type_enum_new"
      USING "type"::text::"stock_movement_type_enum_new"
    `);
    await queryRunner.query(`DROP TYPE "stock_movement_type_enum"`);
    await queryRunner.query(`
      ALTER TYPE "stock_movement_type_enum_new"
      RENAME TO "stock_movement_type_enum"
    `);
  }
}
