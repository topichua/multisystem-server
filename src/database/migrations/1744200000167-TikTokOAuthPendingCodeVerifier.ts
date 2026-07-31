import { MigrationInterface, QueryRunner } from "typeorm";

export class TikTokOAuthPendingCodeVerifier1744200000167
  implements MigrationInterface
{
  name = "TikTokOAuthPendingCodeVerifier1744200000167";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tiktok_oauth_pending_sessions"
      ADD COLUMN IF NOT EXISTS "code_verifier" character varying(128)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tiktok_oauth_pending_sessions"
      DROP COLUMN IF EXISTS "code_verifier"
    `);
  }
}
