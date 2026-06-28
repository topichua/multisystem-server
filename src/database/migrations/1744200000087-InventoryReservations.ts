import { MigrationInterface, QueryRunner } from "typeorm";

export class InventoryReservations1744200000087 implements MigrationInterface {
  name = "InventoryReservations1744200000087";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "reserved_quantity" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TYPE "inventory_reservation_status_enum" AS ENUM (
        'active',
        'released',
        'deducted'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_reservations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "order_item_id" integer NOT NULL,
        "quantity" integer NOT NULL,
        "status" "inventory_reservation_status_enum" NOT NULL DEFAULT 'active',
        "reserved_by_user_id" integer,
        "reserved_at" TIMESTAMPTZ NOT NULL,
        "released_by_user_id" integer,
        "released_at" TIMESTAMPTZ,
        "deducted_by_user_id" integer,
        "deducted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_reservations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_order_item_id"
          FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_reserved_by_user_id"
          FOREIGN KEY ("reserved_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_released_by_user_id"
          FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_reservations_deducted_by_user_id"
          FOREIGN KEY ("deducted_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_reservations_order_item_id" ON "inventory_reservations" ("order_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_reservations_variant_id" ON "inventory_reservations" ("variant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_reservations_status" ON "inventory_reservations" ("status")`,
    );

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN "stock_reserved_at" TIMESTAMPTZ,
      ADD COLUMN "stock_released_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP COLUMN IF EXISTS "stock_released_at",
      DROP COLUMN IF EXISTS "stock_reserved_at"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_reservations"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "inventory_reservation_status_enum"`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "reserved_quantity"
    `);
  }
}
