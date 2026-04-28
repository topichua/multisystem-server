import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationMessageReplyToId1744200000007
  implements MigrationInterface
{
  name = 'ConversationMessageReplyToId1744200000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "reply_to_id" INT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_reply_to_id"
      ON "conversation_messages" ("reply_to_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_messages_reply_to_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "reply_to_id"
    `);
  }
}
