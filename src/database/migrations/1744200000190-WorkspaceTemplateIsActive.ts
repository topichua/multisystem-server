import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceTemplateIsActive1744200000190 implements MigrationInterface {
  name = "WorkspaceTemplateIsActive1744200000190";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_templates"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_templates"
      DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
