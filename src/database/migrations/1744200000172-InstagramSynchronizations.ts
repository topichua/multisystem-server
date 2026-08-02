import { MigrationInterface, QueryRunner } from "typeorm";

export class InstagramSynchronizations1744200000172
  implements MigrationInterface
{
  name = "InstagramSynchronizations1744200000172";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "instagram_synchronizations" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "integration_id" integer NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'pending',
        "phase" character varying(32) NOT NULL DEFAULT 'conversations',
        "since_at" TIMESTAMPTZ NOT NULL,
        "window_days" integer NOT NULL DEFAULT 7,
        "conversations_total" integer NOT NULL DEFAULT 0,
        "conversations_processed" integer NOT NULL DEFAULT 0,
        "conversations_failed" integer NOT NULL DEFAULT 0,
        "messages_imported" integer NOT NULL DEFAULT 0,
        "error" text,
        "started_at" TIMESTAMPTZ,
        "finished_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_instagram_synchronizations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_instagram_synchronizations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_instagram_synchronizations_integration_id"
          FOREIGN KEY ("integration_id") REFERENCES "instagram_integration"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_synchronizations_workspace_id"
      ON "instagram_synchronizations" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_synchronizations_integration_id"
      ON "instagram_synchronizations" ("integration_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_synchronizations_status"
      ON "instagram_synchronizations" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_instagram_synchronizations_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_instagram_synchronizations_integration_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_instagram_synchronizations_workspace_id"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "instagram_synchronizations"`,
    );
  }
}
