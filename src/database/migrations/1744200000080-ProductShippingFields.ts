import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductShippingFields1744200000080 implements MigrationInterface {
  name = "ProductShippingFields1744200000080";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "weight_grams" numeric(12, 3),
      ADD COLUMN "length_cm" numeric(12, 3),
      ADD COLUMN "width_cm" numeric(12, 3),
      ADD COLUMN "height_cm" numeric(12, 3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN "weight_grams",
      DROP COLUMN "length_cm",
      DROP COLUMN "width_cm",
      DROP COLUMN "height_cm"
    `);
  }
}
