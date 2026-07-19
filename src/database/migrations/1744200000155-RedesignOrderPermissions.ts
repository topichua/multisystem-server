import { MigrationInterface, QueryRunner } from "typeorm";

export class RedesignOrderPermissions1744200000155
  implements MigrationInterface
{
  name = "RedesignOrderPermissions1744200000155";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "workspace_roles"
      SET "permission_options" =
        COALESCE("permission_options", '{}'::jsonb) ||
        jsonb_build_object(
          'orders.visibility',
          CASE
            WHEN "permission_options"->>'orders.visibility' IN ('mine', 'all')
              THEN "permission_options"->>'orders.visibility'
            WHEN COALESCE("permissions", '[]'::jsonb) ? 'orders.read'
              THEN 'mine'
            ELSE 'none'
          END
        ),
        "permissions" = (
          SELECT COALESCE(jsonb_agg(DISTINCT permission ORDER BY permission), '[]'::jsonb)
          FROM jsonb_array_elements_text(
            COALESCE("permissions", '[]'::jsonb) ||
            CASE
              WHEN COALESCE("permissions", '[]'::jsonb) ? 'orders.edit_status'
                THEN '["orders.edit"]'::jsonb
              ELSE '[]'::jsonb
            END
          ) AS permission
          WHERE permission NOT IN ('orders.read', 'orders.edit_status')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "workspace_roles"
      SET "permissions" = (
          SELECT COALESCE(jsonb_agg(DISTINCT permission ORDER BY permission), '[]'::jsonb)
          FROM jsonb_array_elements_text(
            COALESCE("permissions", '[]'::jsonb) ||
            CASE
              WHEN "permission_options"->>'orders.visibility' IN ('mine', 'all')
                THEN '["orders.read"]'::jsonb
              ELSE '[]'::jsonb
            END ||
            CASE
              WHEN COALESCE("permissions", '[]'::jsonb) ? 'orders.edit'
                THEN '["orders.edit_status"]'::jsonb
              ELSE '[]'::jsonb
            END
          ) AS permission
        ),
        "permission_options" =
          CASE
            WHEN "permission_options"->>'orders.visibility' = 'none'
              THEN COALESCE("permission_options", '{}'::jsonb) - 'orders.visibility'
            ELSE "permission_options"
          END
    `);
  }
}
