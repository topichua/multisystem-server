import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductMediaUploadMediaId1744200000046
  implements MigrationInterface
{
  name = "ProductMediaUploadMediaId1744200000046";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "upload_media_id" integer NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_upload_media_id"
      FOREIGN KEY ("upload_media_id")
      REFERENCES "upload_media"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_media_upload_media_id"
      ON "product_media" ("upload_media_id")
      WHERE "upload_media_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_media_upload_media_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_upload_media_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "upload_media_id"
    `);
  }
}
