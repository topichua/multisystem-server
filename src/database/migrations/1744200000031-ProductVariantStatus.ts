import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductVariantStatus1744200000031 implements MigrationInterface {
  name = "ProductVariantStatus1744200000031";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "status" "products_status_enum" NOT NULL DEFAULT 'draft'
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_variants_status" ON "product_variants" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_product_variants_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN "status"`,
    );
  }
}
