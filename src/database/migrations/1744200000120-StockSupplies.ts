import { MigrationInterface, QueryRunner } from "typeorm";

export class StockSupplies1744200000120 implements MigrationInterface {
  name = "StockSupplies1744200000120";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_supplies" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "user_id" integer,
        "comment" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_supplies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_supplies_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_supplies_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_supplies_workspace_id"
      ON "stock_supplies" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_supplies_created_at"
      ON "stock_supplies" ("created_at")
    `);

    await queryRunner.query(`
      ALTER TYPE "stock_movement_type_enum"
      ADD VALUE IF NOT EXISTS 'supply'
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "supply_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "FK_stock_movements_supply_id"
      FOREIGN KEY ("supply_id") REFERENCES "stock_supplies"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_movements_supply_id"
      ON "stock_movements" ("supply_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "stock_movements"
      WHERE "type" = 'supply'
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP CONSTRAINT IF EXISTS "FK_stock_movements_supply_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_stock_movements_supply_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP COLUMN IF EXISTS "supply_id"
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
        'simple_order_cancel'
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

    await queryRunner.query(`DROP TABLE IF EXISTS "stock_supplies"`);
  }
}
