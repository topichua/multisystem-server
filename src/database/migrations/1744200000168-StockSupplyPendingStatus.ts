import { MigrationInterface, QueryRunner } from "typeorm";

export class StockSupplyPendingStatus1744200000168 implements MigrationInterface {
  name = "StockSupplyPendingStatus1744200000168";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_supplies"
      ADD COLUMN IF NOT EXISTS "status" character varying(16) NOT NULL DEFAULT 'applied'
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_supplies"
      ADD COLUMN IF NOT EXISTS "applied_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      UPDATE "stock_supplies"
      SET "applied_at" = "created_at"
      WHERE "status" = 'applied' AND "applied_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_supplies_workspace_status"
      ON "stock_supplies" ("workspace_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_supply_items" (
        "id" SERIAL NOT NULL,
        "supply_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "quantity" integer NOT NULL,
        "buy_price" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_stock_supply_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_supply_items_supply_id"
          FOREIGN KEY ("supply_id") REFERENCES "stock_supplies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_supply_items_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_supply_items_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_supply_items_supply_id"
      ON "stock_supply_items" ("supply_id")
    `);

    // Backfill line items from existing supply movements (applied supplies).
    await queryRunner.query(`
      INSERT INTO "stock_supply_items" (
        "supply_id",
        "product_id",
        "variant_id",
        "quantity",
        "buy_price"
      )
      SELECT
        sm."supply_id",
        pv."product_id",
        sm."variant_id",
        sm."quantity_change",
        COALESCE(sm."purchase_price", 0)
      FROM "stock_movements" sm
      INNER JOIN "product_variants" pv ON pv."id" = sm."variant_id"
      WHERE sm."supply_id" IS NOT NULL
        AND sm."type" = 'supply'
        AND NOT EXISTS (
          SELECT 1
          FROM "stock_supply_items" si
          WHERE si."supply_id" = sm."supply_id"
            AND si."variant_id" = sm."variant_id"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_supply_items"`);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_stock_supplies_workspace_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_supplies"
      DROP COLUMN IF EXISTS "applied_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_supplies"
      DROP COLUMN IF EXISTS "status"
    `);
  }
}
