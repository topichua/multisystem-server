import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Manual conversation follow-up ("remind customer later"): schedule a message,
 * cancel on customer reply, activity events created/changed/declined/applied.
 */
export class ConversationFollowUps1744200000188 implements MigrationInterface {
  name = "ConversationFollowUps1744200000188";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "conversation_follow_up_status_enum" AS ENUM (
          'PENDING', 'SENT', 'CANCELLED', 'FAILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_follow_ups" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "conversation_id" integer NOT NULL,
        "status" "conversation_follow_up_status_enum" NOT NULL DEFAULT 'PENDING',
        "scheduled_at" TIMESTAMPTZ NOT NULL,
        "message" text NOT NULL,
        "template_id" integer,
        "cancel_on_reply" boolean NOT NULL DEFAULT true,
        "previous_group_id" integer,
        "created_by_id" integer,
        "updated_by_id" integer,
        "cancel_reason" character varying(64),
        "error_code" character varying(64),
        "error_message" text,
        "sent_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_follow_ups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversation_follow_ups_workspace"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_conversation_follow_ups_conversation"
          FOREIGN KEY ("workspace_id", "conversation_id")
          REFERENCES "conversations"("workspace_id", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_conversation_follow_ups_created_by"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_conversation_follow_ups_updated_by"
          FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_conversation_follow_ups_one_pending"
      ON "conversation_follow_ups" ("workspace_id", "conversation_id")
      WHERE "status" = 'PENDING'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_follow_ups_due"
      ON "conversation_follow_ups" ("status", "scheduled_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_follow_ups_workspace_conversation"
      ON "conversation_follow_ups" ("workspace_id", "conversation_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_follow_ups_workspace_conversation"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_follow_ups_due"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_conversation_follow_ups_one_pending"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_follow_ups"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "conversation_follow_up_status_enum"`,
    );
  }
}
