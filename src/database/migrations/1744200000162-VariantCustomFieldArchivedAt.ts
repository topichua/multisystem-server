import type { MigrationInterface, QueryRunner } from "typeorm";

export class VariantCustomFieldArchivedAt1744200000162
  implements MigrationInterface
{
  name = "VariantCustomFieldArchivedAt1744200000162";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
      ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field_option"
      ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_variant_custom_field_archived_at"
      ON "workspace_variant_custom_field" ("workspace_id", "archived_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wvcf_option_archived_at"
      ON "workspace_variant_custom_field_option" ("field_id", "archived_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_wvcf_option_archived_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_workspace_variant_custom_field_archived_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field_option"
      DROP COLUMN IF EXISTS "archived_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
      DROP COLUMN IF EXISTS "archived_at"
    `);
  }
}
