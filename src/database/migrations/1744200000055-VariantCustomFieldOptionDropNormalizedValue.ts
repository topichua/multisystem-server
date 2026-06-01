import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantCustomFieldOptionDropNormalizedValue1744200000055
  implements MigrationInterface
{
  name = "VariantCustomFieldOptionDropNormalizedValue1744200000055";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "workspace_variant_custom_field_option" a
      USING "workspace_variant_custom_field_option" b
      WHERE a."id" > b."id"
        AND a."field_id" = b."field_id"
        AND lower(btrim(a."label")) = lower(btrim(b."label"))
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_wvcf_option_field_normalized"
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field_option"
      DROP COLUMN IF EXISTS "normalized_value"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wvcf_option_field_label_ci"
      ON "workspace_variant_custom_field_option" ("field_id", lower(btrim("label")))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_wvcf_option_field_label_ci"
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field_option"
      ADD COLUMN IF NOT EXISTS "normalized_value" character varying(128) NULL
    `);

    await queryRunner.query(`
      UPDATE "workspace_variant_custom_field_option"
      SET "normalized_value" = lower(btrim("label"))
      WHERE "normalized_value" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field_option"
      ALTER COLUMN "normalized_value" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wvcf_option_field_normalized"
      ON "workspace_variant_custom_field_option" ("field_id", "normalized_value")
    `);
  }
}
