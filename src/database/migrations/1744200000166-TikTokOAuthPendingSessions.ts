import { MigrationInterface, QueryRunner } from "typeorm";

export class TikTokOAuthPendingSessions1744200000166
  implements MigrationInterface
{
  name = "TikTokOAuthPendingSessions1744200000166";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tiktok_oauth_pending_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'awaiting_tiktok',
        "integration_id" integer,
        "error_message" text,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tiktok_oauth_pending_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tiktok_oauth_pending_sessions_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_tiktok_oauth_pending_sessions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tiktok_oauth_pending_sessions_workspace_id"
      ON "tiktok_oauth_pending_sessions" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tiktok_oauth_pending_sessions_user_id"
      ON "tiktok_oauth_pending_sessions" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tiktok_oauth_pending_sessions_expires_at"
      ON "tiktok_oauth_pending_sessions" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "tiktok_oauth_pending_sessions"`,
    );
  }
}
