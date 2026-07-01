import { MigrationInterface, QueryRunner } from "typeorm";

export class StockEngine1744200000096 implements MigrationInterface {
  name = "StockEngine1744200000096";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "workspace_inventory_mode_enum" AS ENUM ('simple', 'advanced')
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN "inventory_mode" "workspace_inventory_mode_enum" NOT NULL DEFAULT 'simple'
    `);

    await queryRunner.query(`
      CREATE TABLE "variant_stocks" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "quantity" integer NOT NULL DEFAULT 0,
        "avg_purchase_price" numeric(14,2),
        "total_cost" numeric(14,2),
        "stock_initialized" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_variant_stocks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_variant_stocks_variant_id" UNIQUE ("variant_id"),
        CONSTRAINT "FK_variant_stocks_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_variant_stocks_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_variant_stocks_workspace_id" ON "variant_stocks" ("workspace_id")
    `);

    await queryRunner.query(`
      INSERT INTO "variant_stocks" (
        "workspace_id",
        "variant_id",
        "quantity",
        "avg_purchase_price",
        "total_cost",
        "stock_initialized"
      )
      SELECT
        p."workspace_id",
        v."id",
        COALESCE(v."quantity", 0),
        v."average_purchase_price",
        NULLIF(v."stock_cost_total", 0),
        CASE
          WHEN v."average_purchase_price" IS NOT NULL
            AND COALESCE(v."quantity", 0) > 0
          THEN true
          ELSE false
        END
      FROM "product_variants" v
      INNER JOIN "products" p ON p."id" = v."product_id"
    `);

    await queryRunner.query(`
      CREATE TYPE "stock_movement_type_enum" AS ENUM (
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
      CREATE TYPE "stock_movement_reason_enum" AS ENUM (
        'damaged',
        'lost',
        'found',
        'manual',
        'inventory_count',
        'other'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "stock_movements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "type" "stock_movement_type_enum" NOT NULL,
        "quantity_change" integer NOT NULL,
        "purchase_price" numeric(14,2),
        "total_cost_change" numeric(14,2),
        "reason" "stock_movement_reason_enum",
        "comment" text,
        "order_id" integer,
        "order_item_id" integer,
        "user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_movements_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_movements_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_movements_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_movements_order_item_id"
          FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_movements_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_movements_workspace_id" ON "stock_movements" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_movements_variant_id" ON "stock_movements" ("variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_movements_created_at" ON "stock_movements" ("created_at")
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_reservations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_movements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_reservation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_movement_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_movement_reason_enum"`);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "quantity",
      DROP COLUMN IF EXISTS "reserved_quantity",
      DROP COLUMN IF EXISTS "stock_cost_total",
      DROP COLUMN IF EXISTS "average_purchase_price"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP COLUMN IF EXISTS "stock_reserved_at",
      DROP COLUMN IF EXISTS "stock_released_at"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN "stock_reserved_at" TIMESTAMPTZ,
      ADD COLUMN "stock_released_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "quantity" integer,
      ADD COLUMN "reserved_quantity" integer NOT NULL DEFAULT 0,
      ADD COLUMN "stock_cost_total" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN "average_purchase_price" numeric(14,2)
    `);

    await queryRunner.query(`
      UPDATE "product_variants" v
      SET
        "quantity" = vs."quantity",
        "average_purchase_price" = vs."avg_purchase_price",
        "stock_cost_total" = COALESCE(vs."total_cost", 0)
      FROM "variant_stocks" vs
      WHERE vs."variant_id" = v."id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_movement_reason_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_movement_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "variant_stocks"`);
    await queryRunner.query(`
      ALTER TABLE "workspace" DROP COLUMN IF EXISTS "inventory_mode"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_inventory_mode_enum"`);
  }
}
