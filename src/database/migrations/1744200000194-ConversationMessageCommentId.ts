import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationMessageCommentId1744200000194 implements MigrationInterface {
  name = "ConversationMessageCommentId1744200000194";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "comment_id" VARCHAR(255) NULL
    `);
    await queryRunner.query(`
      UPDATE "conversation_messages"
      SET "comment_id" = "external_id"
      WHERE "type" = 'instagram_comment'
        AND "comment_id" IS NULL
        AND "external_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_comment_id"
        ON "conversation_messages" ("comment_id")
        WHERE "comment_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_messages_comment_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        DROP COLUMN IF EXISTS "comment_id"
    `);
  }
}
