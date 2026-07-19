import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceManagementPermissions1744200000156
  implements MigrationInterface
{
  name = "WorkspaceManagementPermissions1744200000156";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "workspace_roles" AS wr
      SET "permissions" = (
        SELECT jsonb_agg(DISTINCT permission ORDER BY permission)
        FROM jsonb_array_elements_text(
          COALESCE(wr."permissions", '[]'::jsonb) ||
          '["workspace.order_statuses", "workspace.settings"]'::jsonb
        ) AS permission
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "workspace_roles" AS wr
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(permission ORDER BY permission), '[]'::jsonb)
        FROM jsonb_array_elements_text(
          COALESCE(wr."permissions", '[]'::jsonb)
        ) AS permission
        WHERE permission NOT IN (
          'workspace.order_statuses',
          'workspace.settings'
        )
      )
    `);
  }
}
