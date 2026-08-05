import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatAutoDistributionLogs1744200000175 implements MigrationInterface {
  name = "ChatAutoDistributionLogs1744200000175";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_auto_distribution_logs" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "integration_type" character varying(32) NOT NULL,
        "integration_id" integer NOT NULL,
        "conversation_id" integer NOT NULL,
        "member_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_auto_distribution_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_auto_distribution_logs_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chat_auto_distribution_logs_conversation_id"
          FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chat_auto_distribution_logs_member_id"
          FOREIGN KEY ("member_id") REFERENCES "workspace_members"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chat_auto_distribution_logs_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_auto_distribution_logs_workspace_id"
      ON "chat_auto_distribution_logs" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_auto_distribution_logs_workspace_created"
      ON "chat_auto_distribution_logs" ("workspace_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_auto_distribution_logs_channel"
      ON "chat_auto_distribution_logs" ("workspace_id", "integration_type", "integration_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_auto_distribution_logs_member_id"
      ON "chat_auto_distribution_logs" ("member_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_chat_auto_distribution_logs_member_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_chat_auto_distribution_logs_channel"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_chat_auto_distribution_logs_workspace_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_chat_auto_distribution_logs_workspace_id"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "chat_auto_distribution_logs"`,
    );
  }
}
