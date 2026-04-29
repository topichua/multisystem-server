import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `conversation_messages`: PK is `external_id` (Instagram message id / Graph `mid`).
 * Reply link is stored as parent message external id in `replied_to_external_id` (varchar).
 */
export class ConversationMessageExternalIdPK1744200000012
  implements MigrationInterface
{
  name = 'ConversationMessageExternalIdPK1744200000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD COLUMN IF NOT EXISTS "replied_to_external_id" VARCHAR(255) NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_messages_reply_to_id"
    `);

    await queryRunner.query(`
      UPDATE "conversation_messages" child
      SET "replied_to_external_id" = parent."external_id"
      FROM "conversation_messages" parent
      WHERE child."reply_to_id" IS NOT NULL
        AND parent."id" = child."reply_to_id"
    `);

    await queryRunner.query(`
      UPDATE "conversation_messages" m
      SET "replied_to_external_id" = m."reply_parent_external_id"
      WHERE m."replied_to_external_id" IS NULL
        AND m."reply_parent_external_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "reply_to_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "reply_parent_external_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      DROP CONSTRAINT IF EXISTS "PK_conversation_messages"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "id"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "PK_conversation_messages" PRIMARY KEY ("external_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_replied_to_external_id"
      ON "conversation_messages" ("replied_to_external_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversation_messages_replied_to_external_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      DROP CONSTRAINT IF EXISTS "PK_conversation_messages"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD COLUMN IF NOT EXISTS "id" SERIAL NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "conversation_messages" m
      SET "id" = sub.rn
      FROM (
        SELECT "external_id", ROW_NUMBER() OVER (ORDER BY "created_at", "external_id") AS rn
        FROM "conversation_messages"
      ) sub
      WHERE m."external_id" = sub."external_id"
    `);

    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('"conversation_messages"', 'id'),
        COALESCE((SELECT MAX("id") FROM "conversation_messages"), 1)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "PK_conversation_messages" PRIMARY KEY ("id")
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD COLUMN IF NOT EXISTS "reply_to_id" INT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD COLUMN IF NOT EXISTS "reply_parent_external_id" VARCHAR(255) NULL
    `);

    await queryRunner.query(`
      UPDATE "conversation_messages" child
      SET "reply_to_id" = parent."id"
      FROM "conversation_messages" parent
      WHERE child."replied_to_external_id" IS NOT NULL
        AND parent."external_id" = child."replied_to_external_id"
    `);

    await queryRunner.query(`
      UPDATE "conversation_messages" m
      SET "reply_parent_external_id" = m."replied_to_external_id"
      WHERE m."reply_to_id" IS NULL
        AND m."replied_to_external_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_reply_to_id"
      ON "conversation_messages" ("reply_to_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages" DROP COLUMN IF EXISTS "replied_to_external_id"
    `);
  }
}
