import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductDropSourceIdReferenceGroupId1744200000049
  implements MigrationInterface
{
  name = "ProductDropSourceIdReferenceGroupId1744200000049";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_products_reference_group_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "source_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "reference_group_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "source_id" character varying(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "reference_group_id" character varying(255) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_products_reference_group_id"
      ON "products" ("reference_group_id")
    `);
  }
}
