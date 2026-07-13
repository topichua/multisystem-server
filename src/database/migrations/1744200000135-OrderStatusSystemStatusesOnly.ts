import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Keep only 5 system order statuses per workspace:
 * new, confirmed, delivery, completed, canceled.
 * Legacy system packed/shipped/returned become custom (is_system = false).
 */
export class OrderStatusSystemStatusesOnly1744200000135 implements MigrationInterface {
  name = "OrderStatusSystemStatusesOnly1744200000135";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "order_statuses"
      SET "is_system" = false
      WHERE "is_system" = true
        AND "category" IN (
          'packed'::order_statuses_category_enum,
          'shipped'::order_statuses_category_enum,
          'returned'::order_statuses_category_enum
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
          (NEW.id, 'Delivery', 'delivery'::order_statuses_category_enum, '#a855f7', 2, false, true, now(), now()),
          (NEW.id, 'Completed', 'completed'::order_statuses_category_enum, '#10b981', 3, false, true, now(), now()),
          (NEW.id, 'Canceled', 'canceled'::order_statuses_category_enum, '#ef4444', 4, false, true, now(), now());
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(): Promise<void> {
    // Non-destructive: do not re-promote demoted statuses to system.
  }
}
