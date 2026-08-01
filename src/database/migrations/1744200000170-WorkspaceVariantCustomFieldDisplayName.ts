import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceVariantCustomFieldDisplayName1744200000170
  implements MigrationInterface
{
  name = "WorkspaceVariantCustomFieldDisplayName1744200000170";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
      ADD COLUMN IF NOT EXISTS "display_name" character varying(128)
    `);
    await queryRunner.query(`
      UPDATE "workspace_variant_custom_field"
      SET "display_name" = "label"
      WHERE "display_name" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
      DROP COLUMN IF EXISTS "display_name"
    `);
  }
}
