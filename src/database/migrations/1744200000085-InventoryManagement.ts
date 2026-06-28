import { MigrationInterface, QueryRunner } from "typeorm";

export class InventoryManagement1744200000085 implements MigrationInterface {
  name = "InventoryManagement1744200000085";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "stock_cost_total" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN "average_purchase_price" numeric(14,2)
    `);

    await queryRunner.query(`
      CREATE TYPE "inventory_movement_type_enum" AS ENUM (
        'increase',
        'decrease',
        'set'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "inventory_movement_reason_enum" AS ENUM (
        'supplier_delivery',
        'customer_return',
        'inventory',
        'defect',
        'error_correction',
        'order_sale'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "type" "inventory_movement_type_enum" NOT NULL,
        "reason" "inventory_movement_reason_enum" NOT NULL,
        "quantity_delta" integer NOT NULL,
        "quantity_before" integer NOT NULL,
        "quantity_after" integer NOT NULL,
        "purchase_price" numeric(14,2),
        "stock_cost_before" numeric(14,2) NOT NULL,
        "stock_cost_after" numeric(14,2) NOT NULL,
        "average_purchase_price_before" numeric(14,2),
        "average_purchase_price_after" numeric(14,2),
        "comment" text,
        "order_id" integer,
        "order_item_id" integer,
        "created_by_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_movements_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_movements_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_movements_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_movements_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_movements_order_item_id"
          FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_movements_created_by_user_id"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_movements_workspace_id" ON "inventory_movements" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_movements_variant_id" ON "inventory_movements" ("variant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_movements_created_at" ON "inventory_movements" ("created_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN "unit_price_snapshot" numeric(14,2),
      ADD COLUMN "unit_cost_snapshot" numeric(14,2),
      ADD COLUMN "total_sale_amount" numeric(14,2),
      ADD COLUMN "total_cost_amount" numeric(14,2),
      ADD COLUMN "profit_amount" numeric(14,2),
      ADD COLUMN "stock_deducted_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE "order_items"
      SET
        "unit_price_snapshot" = "unit_price_amount",
        "total_sale_amount" = "total_price_amount"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP COLUMN IF EXISTS "stock_deducted_at",
      DROP COLUMN IF EXISTS "profit_amount",
      DROP COLUMN IF EXISTS "total_cost_amount",
      DROP COLUMN IF EXISTS "total_sale_amount",
      DROP COLUMN IF EXISTS "unit_cost_snapshot",
      DROP COLUMN IF EXISTS "unit_price_snapshot"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_movements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_movement_reason_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_movement_type_enum"`);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "average_purchase_price",
      DROP COLUMN IF EXISTS "stock_cost_total"
    `);
  }
}
