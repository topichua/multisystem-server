import { MigrationInterface, QueryRunner } from "typeorm";

/** Drops main_media if migration 0052 was applied with an earlier version that added it. */
export class ProductMediaDropMainMedia1744200000053
  implements MigrationInterface
{
  name = "ProductMediaDropMainMedia1744200000053";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "main_media"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "main_media" boolean NOT NULL DEFAULT false
    `);
  }
}
