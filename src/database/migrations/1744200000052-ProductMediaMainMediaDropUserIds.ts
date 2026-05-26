import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductMediaMainMediaDropUserIds1744200000052
  implements MigrationInterface
{
  name = "ProductMediaMainMediaDropUserIds1744200000052";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_updated_by_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "updated_by_user_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "created_by_user_id" integer NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "updated_by_user_id" integer NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_created_by_user_id"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_updated_by_user_id"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }
}
