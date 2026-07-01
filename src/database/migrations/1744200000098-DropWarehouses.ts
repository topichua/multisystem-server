import { MigrationInterface, QueryRunner } from "typeorm";

export class DropWarehouses1744200000098 implements MigrationInterface {
  name = "DropWarehouses1744200000098";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      DROP CONSTRAINT IF EXISTS "FK_variant_stocks_warehouse_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      DROP CONSTRAINT IF EXISTS "UQ_variant_stocks_variant_warehouse"
    `);
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      DROP COLUMN IF EXISTS "warehouse_id"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_variant_stocks_variant_id"
      ON "variant_stocks" ("variant_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP CONSTRAINT IF EXISTS "FK_stock_movements_warehouse_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP COLUMN IF EXISTS "warehouse_id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "warehouses"`);

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "stock_movement_type_enum_old" AS ENUM (
        'initial_stock',
        'purchase',
        'order_sale',
        'order_cancel',
        'return',
        'correction',
        'inventory',
        'transfer_out',
        'transfer_in',
        'simple_adjustment',
        'simple_order_sale',
        'simple_order_cancel'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ALTER COLUMN "type" TYPE "stock_movement_type_enum_old"
      USING "type"::text::"stock_movement_type_enum_old"
    `);
    await queryRunner.query(`DROP TYPE "stock_movement_type_enum"`);
    await queryRunner.query(`
      ALTER TYPE "stock_movement_type_enum_old"
      RENAME TO "stock_movement_type_enum"
    `);

    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_warehouses_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_warehouses_workspace_id" ON "warehouses" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_warehouses_workspace_default"
      ON "warehouses" ("workspace_id")
      WHERE "is_default" = true
    `);
    await queryRunner.query(`
      INSERT INTO "warehouses" ("workspace_id", "name", "is_default")
      SELECT "id", 'Default', true FROM "workspace"
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "warehouse_id" integer
    `);
    await queryRunner.query(`
      UPDATE "stock_movements" sm
      SET "warehouse_id" = w."id"
      FROM "warehouses" w
      WHERE w."workspace_id" = sm."workspace_id" AND w."is_default" = true
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ALTER COLUMN "warehouse_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "FK_stock_movements_warehouse_id"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_variant_stocks_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      ADD COLUMN "warehouse_id" integer
    `);
    await queryRunner.query(`
      UPDATE "variant_stocks" vs
      SET "warehouse_id" = w."id"
      FROM "products" p
      INNER JOIN "product_variants" v ON v."product_id" = p."id"
      INNER JOIN "warehouses" w
        ON w."workspace_id" = p."workspace_id" AND w."is_default" = true
      WHERE vs."variant_id" = v."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      ALTER COLUMN "warehouse_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      ADD CONSTRAINT "UQ_variant_stocks_variant_warehouse"
      UNIQUE ("variant_id", "warehouse_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "variant_stocks"
      ADD CONSTRAINT "FK_variant_stocks_warehouse_id"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE
    `);
  }
}
