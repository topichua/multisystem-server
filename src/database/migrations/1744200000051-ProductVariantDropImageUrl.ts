import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductVariantDropImageUrl1744200000051
  implements MigrationInterface
{
  name = "ProductVariantDropImageUrl1744200000051";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "product_media" (
        "product_id",
        "variant_id",
        "url",
        "type",
        "source_url",
        "sort_order",
        "created_by_user_id",
        "updated_by_user_id"
      )
      SELECT
        pv."product_id",
        pv."id" AS variant_id,
        btrim(pv."image_url"),
        'image',
        NULL,
        0,
        pv."created_by_user_id",
        NULL
      FROM "product_variants" pv
      WHERE pv."image_url" IS NOT NULL
        AND btrim(pv."image_url") <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "product_media" pm
          WHERE pm."product_id" = pv."product_id"
            AND pm."variant_id" = pv."id"
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "image_url"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "image_url" text NULL
    `);

    await queryRunner.query(`
      UPDATE "product_variants" pv
      SET "image_url" = (
        SELECT pm."url"
        FROM "product_media" pm
        WHERE pm."product_id" = pv."product_id"
          AND pm."variant_id" = pv."id"
        ORDER BY pm."sort_order" ASC, pm."id" ASC
        LIMIT 1
      )
    `);
  }
}

