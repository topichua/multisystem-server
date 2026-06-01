import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceVariantCustomFieldDropOptionsJsonb1744200000056
  implements MigrationInterface
{
  name = "WorkspaceVariantCustomFieldDropOptionsJsonb1744200000056";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
      DROP COLUMN IF EXISTS "options"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
      ADD COLUMN IF NOT EXISTS "options" jsonb NULL
    `);

    await queryRunner.query(`
      UPDATE "workspace_variant_custom_field" w
      SET "options" = COALESCE(
        (
          SELECT jsonb_agg(o."label" ORDER BY o."id")
          FROM "workspace_variant_custom_field_option" o
          WHERE o."field_id" = w."id"
        ),
        '[]'::jsonb
      )
      WHERE w."type" = 'options'
    `);
  }
}
