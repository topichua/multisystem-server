import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductVariantCustomFieldValues1744200000048
  implements MigrationInterface
{
  name = "ProductVariantCustomFieldValues1744200000048";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_variant_custom_field_value" (
        "id" SERIAL NOT NULL,
        "variant_id" integer NOT NULL,
        "field_id" integer NOT NULL,
        "value" character varying(128) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_variant_custom_field_value" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_variant_custom_field_value_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_variant_custom_field_value_field_id"
          FOREIGN KEY ("field_id") REFERENCES "workspace_variant_custom_field"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_variant_custom_field_value_variant_field"
      ON "product_variant_custom_field_value" ("variant_id", "field_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_variant_custom_field_value_variant_id"
      ON "product_variant_custom_field_value" ("variant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_variant_custom_field_value_field_value"
      ON "product_variant_custom_field_value" ("field_id", "value")
    `);

    await queryRunner.query(`
      INSERT INTO "product_variant_custom_field_value" ("variant_id", "field_id", "value")
      SELECT
        pv."id",
        wvcf."id",
        btrim(pv."custom_attributes"->>wvcf."key")
      FROM "product_variants" pv
      INNER JOIN "products" p ON p."id" = pv."product_id"
      INNER JOIN "workspace_variant_custom_field" wvcf
        ON wvcf."workspace_id" = p."workspace_id"
      WHERE pv."custom_attributes" ? wvcf."key"
        AND btrim(pv."custom_attributes"->>wvcf."key") <> ''
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "custom_attributes"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "custom_attributes" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      UPDATE "product_variants" pv
      SET "custom_attributes" = COALESCE(
        (
          SELECT jsonb_object_agg(wvcf."key", cfv."value")
          FROM "product_variant_custom_field_value" cfv
          INNER JOIN "workspace_variant_custom_field" wvcf ON wvcf."id" = cfv."field_id"
          WHERE cfv."variant_id" = pv."id"
        ),
        '{}'::jsonb
      )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "product_variant_custom_field_value"`);
  }
}
