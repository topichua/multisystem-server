import type { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationCreatedAt1744200000148 implements MigrationInterface {
  name = "ConversationCreatedAt1744200000148";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN "created_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      UPDATE "conversations" AS c
      SET "created_at" = COALESCE(
        (
          SELECT MIN(m."created_at")
          FROM "conversation_messages" AS m
          WHERE m."conversation_id" = c."id"
        ),
        c."inst_updated_at"
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ALTER COLUMN "created_at" SET DEFAULT now(),
      ALTER COLUMN "created_at" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_workspace_created_at"
      ON "conversations" ("workspace_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversations_workspace_created_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP COLUMN IF EXISTS "created_at"
    `);
  }
}
