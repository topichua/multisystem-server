import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusIsSystemAndDeliveryCategory1744200000034
  implements MigrationInterface
{
  name = "OrderStatusIsSystemAndDeliveryCategory1744200000034";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL: new enum values must be committed before use (55P04).
    await queryRunner.commitTransaction();
    await queryRunner.query(`
      ALTER TYPE "order_statuses_category_enum" ADD VALUE IF NOT EXISTS 'delivery'
    `);
    await queryRunner.startTransaction();

    await queryRunner.query(`
      ALTER TABLE "order_statuses"
      ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE "order_statuses"
      SET "is_system" = true
      WHERE "category" IN (
        'new', 'confirmed', 'packed', 'shipped', 'completed', 'canceled', 'delivery'
      )
      OR "name" = 'Delivery'
    `);

    await queryRunner.query(`
      UPDATE "order_statuses"
      SET
        "category" = 'delivery'::order_statuses_category_enum,
        "color" = '#a855f7',
        "sort_order" = 4,
        "is_system" = true
      WHERE "name" = 'Delivery'
        AND "category"::text <> 'delivery'
    `);

    await queryRunner.query(`
      UPDATE "order_statuses"
      SET "sort_order" = 5
      WHERE "category" = 'completed'
        AND "sort_order" < 5
    `);

    await queryRunner.query(`
      UPDATE "order_statuses"
      SET "sort_order" = 6
      WHERE "category" = 'canceled'
        AND "sort_order" < 6
    `);

    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('order_statuses', 'id'),
        COALESCE((SELECT MAX("id") FROM "order_statuses"), 1)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "order_statuses" (
        "workspace_id", "name", "category", "color", "sort_order",
        "is_default", "is_system", "created_at", "updated_at"
      )
      SELECT
        w."id",
        'Delivery',
        'delivery'::order_statuses_category_enum,
        '#a855f7',
        4,
        false,
        true,
        now(),
        now()
      FROM "workspace" w
      WHERE NOT EXISTS (
        SELECT 1 FROM "order_statuses" os
        WHERE os."workspace_id" = w."id" AND os."category" = 'delivery'
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_seed_order_statuses_for_workspace()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO "order_statuses" (
          "workspace_id", "name", "category", "color", "sort_order",
          "is_default", "is_system", "created_at", "updated_at"
        ) VALUES
          (NEW.id, 'New', 'new'::order_statuses_category_enum, '#6366f1', 0, true, true, now(), now()),
          (NEW.id, 'Confirmed', 'confirmed'::order_statuses_category_enum, '#22c55e', 1, false, true, now(), now()),
          (NEW.id, 'Packed', 'packed'::order_statuses_category_enum, '#eab308', 2, false, true, now(), now()),
          (NEW.id, 'Shipped', 'shipped'::order_statuses_category_enum, '#3b82f6', 3, false, true, now(), now()),
          (NEW.id, 'Delivery', 'delivery'::order_statuses_category_enum, '#a855f7', 4, false, true, now(), now()),
          (NEW.id, 'Completed', 'completed'::order_statuses_category_enum, '#10b981', 5, false, true, now(), now()),
          (NEW.id, 'Canceled', 'canceled'::order_statuses_category_enum, '#ef4444', 6, false, true, now(), now());
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "order_statuses" WHERE "category" = 'delivery'
    `);

    await queryRunner.query(`
      UPDATE "order_statuses"
      SET "sort_order" = "sort_order" - 1
      WHERE "category" IN ('completed', 'canceled')
    `);

    await queryRunner.query(`
      ALTER TABLE "order_statuses" DROP COLUMN IF EXISTS "is_system"
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_seed_order_statuses_for_workspace()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO "order_statuses" (
          "workspace_id", "name", "category", "color", "sort_order", "is_default", "created_at", "updated_at"
        ) VALUES
          (NEW.id, 'New', 'new'::order_statuses_category_enum, '#6366f1', 0, true, now(), now()),
          (NEW.id, 'Confirmed', 'confirmed'::order_statuses_category_enum, '#22c55e', 1, false, now(), now()),
          (NEW.id, 'Packed', 'packed'::order_statuses_category_enum, '#eab308', 2, false, now(), now()),
          (NEW.id, 'Shipped', 'shipped'::order_statuses_category_enum, '#3b82f6', 3, false, now(), now()),
          (NEW.id, 'Completed', 'completed'::order_statuses_category_enum, '#10b981', 4, false, now(), now()),
          (NEW.id, 'Canceled', 'canceled'::order_statuses_category_enum, '#ef4444', 5, false, now(), now());
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }
}
