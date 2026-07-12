import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ensures every workspace has all 6 system order statuses and keeps the
 * workspace INSERT trigger aligned with `ORDER_STATUS_SYSTEM_DEFAULTS`.
 */
export class SeedOrderStatusesOnWorkspaceCreate1744200000112
  implements MigrationInterface
{
  name = "SeedOrderStatusesOnWorkspaceCreate1744200000112";

  public async up(queryRunner: QueryRunner): Promise<void> {
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
          (NEW.id, 'Canceled', 'canceled'::order_statuses_category_enum, '#ef4444', 4, false, true, now(), now()),
          (NEW.id, 'Returned', 'returned'::order_statuses_category_enum, '#f97316', 5, false, true, now(), now());
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    const categories = [
      { name: "New", category: "new", color: "#6366f1", sortOrder: 0, isDefault: true },
      { name: "Confirmed", category: "confirmed", color: "#22c55e", sortOrder: 1, isDefault: false },
      { name: "Delivery", category: "delivery", color: "#a855f7", sortOrder: 2, isDefault: false },
      { name: "Completed", category: "completed", color: "#10b981", sortOrder: 3, isDefault: false },
      { name: "Canceled", category: "canceled", color: "#ef4444", sortOrder: 4, isDefault: false },
      { name: "Returned", category: "returned", color: "#f97316", sortOrder: 5, isDefault: false },
    ] as const;

    for (const def of categories) {
      await queryRunner.query(
        `
        INSERT INTO "order_statuses" (
          "workspace_id", "name", "category", "color", "sort_order",
          "is_default", "is_system", "created_at", "updated_at"
        )
        SELECT
          w."id",
          $1,
          $2::order_statuses_category_enum,
          $3,
          $4,
          $5,
          true,
          now(),
          now()
        FROM "workspace" w
        WHERE NOT EXISTS (
          SELECT 1 FROM "order_statuses" os
          WHERE os."workspace_id" = w."id"
            AND os."category" = $2::order_statuses_category_enum
            AND os."is_system" = true
        )
        `,
        [def.name, def.category, def.color, def.sortOrder, def.isDefault],
      );
    }

    await queryRunner.query(`
      UPDATE "order_statuses" os
      SET "is_default" = true
      FROM "workspace" w
      WHERE os."workspace_id" = w."id"
        AND os."category" = 'new'::order_statuses_category_enum
        AND os."is_system" = true
        AND NOT EXISTS (
          SELECT 1 FROM "order_statuses" d
          WHERE d."workspace_id" = w."id" AND d."is_default" = true
        )
    `);
  }

  public async down(): Promise<void> {
    // Non-destructive: keep seeded rows and trigger as-is.
  }
}
