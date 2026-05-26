import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductVariantDropColorSize1744200000047
  implements MigrationInterface
{
  name = "ProductVariantDropColorSize1744200000047";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "product_variants"
      SET "custom_attributes" = "custom_attributes"
        || CASE
          WHEN "color" IS NOT NULL AND btrim("color") <> ''
            AND NOT ("custom_attributes" ? 'color')
          THEN jsonb_build_object('color', btrim("color"))
          ELSE '{}'::jsonb
        END
        || CASE
          WHEN "size" IS NOT NULL AND btrim("size") <> ''
            AND NOT ("custom_attributes" ? 'size')
          THEN jsonb_build_object('size', btrim("size"))
          ELSE '{}'::jsonb
        END
      WHERE ("color" IS NOT NULL AND btrim("color") <> '')
         OR ("size" IS NOT NULL AND btrim("size") <> '')
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "color"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "size"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "color" character varying(128) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "size" character varying(128) NULL
    `);

    await queryRunner.query(`
      UPDATE "product_variants"
      SET
        "color" = NULLIF("custom_attributes"->>'color', ''),
        "size" = NULLIF("custom_attributes"->>'size', '')
    `);
  }
}
