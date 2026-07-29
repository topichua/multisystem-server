import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Remove legacy packed/shipped order statuses from all workspaces.
 * Orders and automations that targeted them move to the workspace system
 * `delivery` status (fallback: system `confirmed`, then workspace default).
 */
export class DeletePackedShippedOrderStatuses1744200000163
  implements MigrationInterface
{
  name = "DeletePackedShippedOrderStatuses1744200000163";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH target AS (
        SELECT DISTINCT ON (s.workspace_id)
          s.workspace_id,
          s.id AS target_status_id
        FROM order_statuses s
        WHERE s.category IN (
          'delivery'::order_statuses_category_enum,
          'confirmed'::order_statuses_category_enum
        )
          OR s.is_default = true
        ORDER BY
          s.workspace_id,
          CASE
            WHEN s.category = 'delivery'::order_statuses_category_enum
              AND s.is_system = true THEN 0
            WHEN s.category = 'delivery'::order_statuses_category_enum THEN 1
            WHEN s.category = 'confirmed'::order_statuses_category_enum
              AND s.is_system = true THEN 2
            WHEN s.is_default = true THEN 3
            ELSE 4
          END,
          s.id
      ),
      doomed AS (
        SELECT id, workspace_id
        FROM order_statuses
        WHERE category IN (
          'packed'::order_statuses_category_enum,
          'shipped'::order_statuses_category_enum
        )
      )
      UPDATE orders o
      SET status_id = t.target_status_id,
          updated_at = now()
      FROM doomed d
      JOIN target t ON t.workspace_id = d.workspace_id
      WHERE o.status_id = d.id
        AND o.status_id IS DISTINCT FROM t.target_status_id
    `);

    await queryRunner.query(`
      WITH target AS (
        SELECT DISTINCT ON (s.workspace_id)
          s.workspace_id,
          s.id AS target_status_id
        FROM order_statuses s
        WHERE s.category IN (
          'delivery'::order_statuses_category_enum,
          'confirmed'::order_statuses_category_enum
        )
          OR s.is_default = true
        ORDER BY
          s.workspace_id,
          CASE
            WHEN s.category = 'delivery'::order_statuses_category_enum
              AND s.is_system = true THEN 0
            WHEN s.category = 'delivery'::order_statuses_category_enum THEN 1
            WHEN s.category = 'confirmed'::order_statuses_category_enum
              AND s.is_system = true THEN 2
            WHEN s.is_default = true THEN 3
            ELSE 4
          END,
          s.id
      ),
      doomed AS (
        SELECT id, workspace_id
        FROM order_statuses
        WHERE category IN (
          'packed'::order_statuses_category_enum,
          'shipped'::order_statuses_category_enum
        )
      )
      UPDATE order_status_automations a
      SET target_order_status_id = t.target_status_id,
          updated_at = now()
      FROM doomed d
      JOIN target t ON t.workspace_id = d.workspace_id
      WHERE a.target_order_status_id = d.id
        AND a.target_order_status_id IS DISTINCT FROM t.target_status_id
    `);

    await queryRunner.query(`
      DELETE FROM order_statuses
      WHERE category IN (
        'packed'::order_statuses_category_enum,
        'shipped'::order_statuses_category_enum
      )
    `);
  }

  public async down(): Promise<void> {
    // Non-reversible: packed/shipped rows and prior order status links are not restored.
  }
}
