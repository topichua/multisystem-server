import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoleIntegrationGrantAssignResponsibility1744200000067 implements MigrationInterface {
  name = "WorkspaceRoleIntegrationGrantAssignResponsibility1744200000067";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_role_integration_grants"
      ADD COLUMN "conversations_assign_responsibility" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE "workspace_role_integration_grants" g
      SET "conversations_assign_responsibility" = true
      FROM "workspace_roles" r
      WHERE g."role_id" = r."id"
        AND r."permissions"::jsonb @> '["conversations.assign"]'::jsonb
    `);

    await queryRunner.query(`
      UPDATE "workspace_roles" r
      SET "permissions" = COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(trimmed))
          FROM jsonb_array_elements_text(r."permissions") AS t(trimmed)
          WHERE trimmed <> 'conversations.assign'
        ),
        '[]'::jsonb
      )
      WHERE r."permissions"::jsonb @> '["conversations.assign"]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_role_integration_grants"
      DROP COLUMN "conversations_assign_responsibility"
    `);
  }
}
