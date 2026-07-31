import { MigrationInterface, QueryRunner } from "typeorm";

export class TikTokIntegrations1744200000165 implements MigrationInterface {
  name = "TikTokIntegrations1744200000165";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tiktok_oauth_states" (
        "id" SERIAL NOT NULL,
        "state" character varying(128) NOT NULL,
        "workspace_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tiktok_oauth_states" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tiktok_oauth_states_state" UNIQUE ("state"),
        CONSTRAINT "FK_tiktok_oauth_states_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_tiktok_oauth_states_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tiktok_oauth_states_expires_at" ON "tiktok_oauth_states" ("expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tiktok_oauth_states_workspace_id" ON "tiktok_oauth_states" ("workspace_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "tiktok_integrations" (
        "id" SERIAL NOT NULL,
        "provider" character varying(32) NOT NULL DEFAULT 'TIKTOK',
        "name" character varying(255) NOT NULL,
        "open_id" character varying(255) NOT NULL,
        "access_token_encrypted" text NOT NULL,
        "refresh_token_encrypted" text,
        "scopes" character varying(512),
        "access_token_expires_at" TIMESTAMPTZ,
        "refresh_token_expires_at" TIMESTAMPTZ,
        "status" character varying(32) NOT NULL DEFAULT 'CONNECTED',
        "display_name" character varying(255),
        "username" character varying(255),
        "avatar_url" text,
        "owner_id" integer NOT NULL,
        "workspace_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tiktok_integrations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tiktok_integrations_owner_id"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_tiktok_integrations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "UQ_tiktok_integrations_workspace_open_id"
          UNIQUE ("workspace_id", "open_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tiktok_integrations_workspace_id" ON "tiktok_integrations" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tiktok_integrations_owner_id" ON "tiktok_integrations" ("owner_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tiktok_integrations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tiktok_oauth_states"`);
  }
}
