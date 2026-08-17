import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationMessageSocialMediaId1744200000192 implements MigrationInterface {
  name = "ConversationMessageSocialMediaId1744200000192";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "social_media_id" VARCHAR(255) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_social_media_id"
        ON "conversation_messages" ("social_media_id")
        WHERE "social_media_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_messages_social_media_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        DROP COLUMN IF EXISTS "social_media_id"
    `);
  }
}
