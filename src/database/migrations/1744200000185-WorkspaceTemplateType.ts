import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Workspace templates: type chat | order for variable substitution contexts.
 */
export class WorkspaceTemplateType1744200000185 implements MigrationInterface {
  name = "WorkspaceTemplateType1744200000185";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "workspace_template_type_enum" AS ENUM ('chat', 'order');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_templates"
      ADD COLUMN IF NOT EXISTS "type" "workspace_template_type_enum"
    `);

    await queryRunner.query(`
      UPDATE "workspace_templates"
      SET "type" = 'chat'
      WHERE "type" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_templates"
      ALTER COLUMN "type" SET DEFAULT 'chat'
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_templates"
      ALTER COLUMN "type" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_templates_workspace_type"
      ON "workspace_templates" ("workspace_id", "type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_workspace_templates_workspace_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_templates"
      DROP COLUMN IF EXISTS "type"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "workspace_template_type_enum"
    `);
  }
}
