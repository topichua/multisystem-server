import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRolePermissionOptionLists1744200000064 implements MigrationInterface {
  name = "WorkspaceRolePermissionOptionLists1744200000064";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      ADD COLUMN "permission_option_lists" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      DROP COLUMN "permission_option_lists"
    `);
  }
}
