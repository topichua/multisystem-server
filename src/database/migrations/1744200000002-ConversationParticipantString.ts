import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Older installs used `integer` for `participant_id`; Instagram ids can exceed 32-bit.
 * Adds unique upsert key if missing.
 */
export class ConversationParticipantString1744200000002
  implements MigrationInterface
{
  name = 'ConversationParticipantString1744200000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'conversations'
            AND column_name = 'participant_id'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE "conversations"
            ALTER COLUMN "participant_id" TYPE character varying(255)
            USING CAST("participant_id" AS character varying(255));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_conversations_manager_external_id'
        ) THEN
          ALTER TABLE "conversations"
            ADD CONSTRAINT "UQ_conversations_manager_external_id"
            UNIQUE ("manager_id", "external_id");
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Irreversible: varchar participant ids may not fit in integer.
  }
}
