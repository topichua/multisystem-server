import { MigrationInterface, QueryRunner } from "typeorm";

export class TelegramIntegrations1744200000037 implements MigrationInterface {
  name = "TelegramIntegrations1744200000037";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telegram_integrations" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "owner_id" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "phone_number" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'pending_code',
        "telegram_user_id" character varying(32),
        "telegram_username" character varying(255),
        "session_string" text,
        "auth_session_string" text,
        "phone_code_hash" character varying(255),
        "connected_at" TIMESTAMPTZ,
        "last_error" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telegram_integrations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_telegram_integrations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_telegram_integrations_owner_id"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "UQ_telegram_integrations_workspace_phone"
          UNIQUE ("workspace_id", "phone_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_integrations_workspace_id" ON "telegram_integrations" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_integrations_owner_id" ON "telegram_integrations" ("owner_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_integrations"`);
  }
}
