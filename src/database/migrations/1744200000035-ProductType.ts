import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductType1744200000035 implements MigrationInterface {
  name = "ProductType1744200000035";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "products_product_type_enum" AS ENUM ('single', 'variants')
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "product_type" "products_product_type_enum" NOT NULL DEFAULT 'single'
    `);
    await queryRunner.query(`
      UPDATE "products"
      SET "product_type" = 'variants'
      WHERE EXISTS (
        SELECT 1 FROM "product_variants" pv
        WHERE pv."product_id" = "products"."id"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN "product_type"
    `);
    await queryRunner.query(`DROP TYPE "products_product_type_enum"`);
  }
}
