import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationMessageReadAt1744200000010
  implements MigrationInterface
{
  name = 'ConversationMessageReadAt1744200000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "read_at"
    `);
  }
}
