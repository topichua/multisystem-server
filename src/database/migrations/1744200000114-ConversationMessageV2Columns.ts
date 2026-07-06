import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationMessageV2Columns1744200000114 implements MigrationInterface {
  name = "ConversationMessageV2Columns1744200000114";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "conversation_message_type_enum" AS ENUM (
        'text',
        'image',
        'video',
        'audio',
        'file',
        'instagram_comment',
        'instagram_post',
        'instagram_reels',
        'instagram_story'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "type" "conversation_message_type_enum" NOT NULL DEFAULT 'text',
        ADD COLUMN IF NOT EXISTS "reactions_json" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "attachment_json" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        DROP COLUMN IF EXISTS "attachment_json",
        DROP COLUMN IF EXISTS "reactions_json",
        DROP COLUMN IF EXISTS "type",
        DROP COLUMN IF EXISTS "deleted_at"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "conversation_message_type_enum"
    `);
  }
}
