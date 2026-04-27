import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationMessageEditedAt1744200000003
  implements MigrationInterface
{
  name = 'ConversationMessageEditedAt1744200000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
        ADD COLUMN IF NOT EXISTS "system_updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      UPDATE "conversation_messages"
      SET "system_updated_at" = "created_at"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "system_updated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "edited_at"
    `);
  }
}
