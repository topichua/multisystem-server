import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRolePermissionOptions1744200000063 implements MigrationInterface {
  name = "WorkspaceRolePermissionOptions1744200000063";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      ADD COLUMN "permission_options" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      DROP COLUMN "permission_options"
    `);
  }
}
