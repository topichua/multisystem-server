import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantCustomFieldOptions1744200000054
  implements MigrationInterface
{
  name = "VariantCustomFieldOptions1744200000054";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_variant_custom_field_option" (
        "id" SERIAL NOT NULL,
        "field_id" integer NOT NULL,
        "normalized_value" character varying(128) NOT NULL,
        "label" character varying(128) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_variant_custom_field_option" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wvcf_option_field_id"
          FOREIGN KEY ("field_id") REFERENCES "workspace_variant_custom_field"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wvcf_option_field_normalized"
      ON "workspace_variant_custom_field_option" ("field_id", "normalized_value")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wvcf_option_field_id"
      ON "workspace_variant_custom_field_option" ("field_id")
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_variant_custom_field_option" ("field_id", "normalized_value", "label")
      SELECT DISTINCT
        w."id",
        lower(btrim(opt.value)),
        btrim(opt.value)
      FROM "workspace_variant_custom_field" w
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(w."options", '[]'::jsonb)) AS opt(value)
      WHERE w."type" = 'options'
        AND btrim(opt.value) <> ''
      ON CONFLICT ("field_id", "normalized_value") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variant_custom_field_value"
      ADD COLUMN IF NOT EXISTS "option_id" integer NULL,
      ADD COLUMN IF NOT EXISTS "text_value" character varying(512) NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "product_variant_custom_field_value"
        ADD CONSTRAINT "FK_pvcfv_option_id"
        FOREIGN KEY ("option_id") REFERENCES "workspace_variant_custom_field_option"("id") ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      UPDATE "product_variant_custom_field_value" cfv
      SET "option_id" = o."id"
      FROM "workspace_variant_custom_field" w
      INNER JOIN "workspace_variant_custom_field_option" o
        ON o."field_id" = w."id"
      WHERE cfv."field_id" = w."id"
        AND w."type" = 'options'
        AND cfv."option_id" IS NULL
        AND o."normalized_value" = lower(btrim(cfv."value"))
    `);

    await queryRunner.query(`
      UPDATE "product_variant_custom_field_value" cfv
      SET "text_value" = cfv."value"
      FROM "workspace_variant_custom_field" w
      WHERE cfv."field_id" = w."id"
        AND w."type" = 'text'
        AND cfv."text_value" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant_custom_field_value"
      DROP CONSTRAINT IF EXISTS "FK_pvcfv_option_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variant_custom_field_value"
      DROP COLUMN IF EXISTS "option_id",
      DROP COLUMN IF EXISTS "text_value"
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "workspace_variant_custom_field_option"`,
    );
  }
}
