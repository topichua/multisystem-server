import type { MigrationInterface, QueryRunner } from "typeorm";

export class InstagramLoginOAuth1744200000191 implements MigrationInterface {
  name = "InstagramLoginOAuth1744200000191";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_integration"
      ADD COLUMN IF NOT EXISTS "oauth_provider" character varying(32) NOT NULL DEFAULT 'facebook'
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      ADD COLUMN IF NOT EXISTS "oauth_provider" character varying(32) NOT NULL DEFAULT 'facebook'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      DROP COLUMN IF EXISTS "oauth_provider"
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_integration"
      DROP COLUMN IF EXISTS "oauth_provider"
    `);
  }
}
