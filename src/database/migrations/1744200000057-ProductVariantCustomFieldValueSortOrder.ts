import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductVariantCustomFieldValueSortOrder1744200000057
  implements MigrationInterface
{
  name = "ProductVariantCustomFieldValueSortOrder1744200000057";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant_custom_field_value"
      ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant_custom_field_value"
      DROP COLUMN IF EXISTS "sort_order"
    `);
  }
}
