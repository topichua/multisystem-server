import { MigrationInterface, QueryRunner } from "typeorm";

export class InstagramOAuthPendingPollStatus1744200000158
  implements MigrationInterface
{
  name = "InstagramOAuthPendingPollStatus1744200000158";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      ADD COLUMN IF NOT EXISTS "status" character varying(32) NOT NULL DEFAULT 'awaiting_facebook'
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      ADD COLUMN IF NOT EXISTS "error_message" text
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      ALTER COLUMN "user_access_token" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      ALTER COLUMN "pages" SET DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "instagram_oauth_pending_sessions"
      SET
        "status" = CASE
          WHEN "user_access_token" IS NOT NULL
            AND jsonb_array_length(COALESCE("pages", '[]'::jsonb)) > 0
            THEN 'select_page'
          ELSE 'awaiting_facebook'
        END,
        "pages" = COALESCE("pages", '[]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "instagram_oauth_pending_sessions"
      WHERE "user_access_token" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      ALTER COLUMN "user_access_token" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      DROP COLUMN IF EXISTS "error_message"
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_oauth_pending_sessions"
      DROP COLUMN IF EXISTS "status"
    `);
  }
}
