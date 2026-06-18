import { MigrationInterface, QueryRunner } from "typeorm";

export class UserAvatarCloudflareImageId1744200000075 implements MigrationInterface {
  name = "UserAvatarCloudflareImageId1744200000075";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "avatar_cloudflare_image_id" character varying(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "avatar_cloudflare_image_id"
    `);
  }
}
