import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationMessageReplyParentExternalId1744200000011
  implements MigrationInterface
{
  name = 'ConversationMessageReplyParentExternalId1744200000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "reply_parent_external_id" VARCHAR(255) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_reply_parent_external_id"
      ON "conversation_messages" ("reply_parent_external_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_messages_reply_parent_external_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "reply_parent_external_id"
    `);
  }
}
