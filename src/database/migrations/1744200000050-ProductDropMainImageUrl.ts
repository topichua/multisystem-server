import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductDropMainImageUrl1744200000050 implements MigrationInterface {
  name = "ProductDropMainImageUrl1744200000050";

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
        p."id",
        NULL,
        btrim(p."main_image_url"),
        'image',
        NULL,
        0,
        p."created_by_user_id",
        NULL
      FROM "products" p
      WHERE p."main_image_url" IS NOT NULL
        AND btrim(p."main_image_url") <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "product_media" pm
          WHERE pm."product_id" = p."id"
            AND pm."variant_id" IS NULL
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "main_image_url"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "main_image_url" text NULL
    `);

    await queryRunner.query(`
      UPDATE "products" p
      SET "main_image_url" = (
        SELECT pm."url"
        FROM "product_media" pm
        WHERE pm."product_id" = p."id"
          AND pm."variant_id" IS NULL
        ORDER BY pm."sort_order" ASC, pm."id" ASC
        LIMIT 1
      )
    `);
  }
}
