import type { MigrationInterface, QueryRunner } from "typeorm";

const CONVERSATION_ID_SEQUENCE_START = 1;

/**
 * Per-workspace sequential conversation ids starting at 1.
 * Composite PK: (workspace_id, id). Child FKs become (workspace_id, conversation_id).
 */
export class ConversationWorkspaceLocalIds1744200000181
  implements MigrationInterface
{
  name = "ConversationWorkspaceLocalIds1744200000181";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_conversation_sequences" (
        "workspace_id" integer NOT NULL,
        "next_conversation_id" integer NOT NULL DEFAULT ${CONVERSATION_ID_SEQUENCE_START},
        CONSTRAINT "PK_workspace_conversation_sequences" PRIMARY KEY ("workspace_id"),
        CONSTRAINT "FK_workspace_conversation_sequences_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Drop single-column FKs into conversations(id)
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      DROP CONSTRAINT IF EXISTS "FK_conversation_messages_conversation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_events"
      DROP CONSTRAINT IF EXISTS "FK_conversation_events_conversation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP CONSTRAINT IF EXISTS "FK_orders_conversation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_suggestions"
      DROP CONSTRAINT IF EXISTS "FK_product_suggestions_conversation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_auto_distribution_logs"
      DROP CONSTRAINT IF EXISTS "FK_chat_auto_distribution_logs_conversation_id"
    `);

    // workspace_id on children that lack it
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD COLUMN IF NOT EXISTS "workspace_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_events"
      ADD COLUMN IF NOT EXISTS "workspace_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "product_suggestions"
      ADD COLUMN IF NOT EXISTS "workspace_id" integer
    `);

    await queryRunner.query(`
      UPDATE "conversation_messages" m
      SET "workspace_id" = c."workspace_id"
      FROM "conversations" c
      WHERE m."conversation_id" = c."id"
        AND m."workspace_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "conversation_events" e
      SET "workspace_id" = c."workspace_id"
      FROM "conversations" c
      WHERE e."conversation_id" = c."id"
        AND e."workspace_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "product_suggestions" s
      SET "workspace_id" = c."workspace_id"
      FROM "conversations" c
      WHERE s."conversation_id" = c."id"
        AND s."workspace_id" IS NULL
    `);

    // Orphan rows (no parent) must not block NOT NULL — clear them if any
    await queryRunner.query(`
      DELETE FROM "conversation_messages" WHERE "workspace_id" IS NULL
    `);
    await queryRunner.query(`
      DELETE FROM "conversation_events" WHERE "workspace_id" IS NULL
    `);
    await queryRunner.query(`
      DELETE FROM "product_suggestions" WHERE "workspace_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_events"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_suggestions"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);

    // Temporary per-workspace local ids (avoids global PK collisions while remapping)
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN "local_id" integer
    `);
    await queryRunner.query(`
      UPDATE "conversations" c
      SET "local_id" = sub."rn"
      FROM (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "workspace_id"
            ORDER BY "created_at" ASC, "id" ASC
          ) AS "rn"
        FROM "conversations"
      ) sub
      WHERE c."id" = sub."id"
    `);

    // Point children at new local ids (scoped by workspace_id)
    await queryRunner.query(`
      UPDATE "conversation_messages" m
      SET "conversation_id" = c."local_id"
      FROM "conversations" c
      WHERE m."conversation_id" = c."id"
        AND m."workspace_id" = c."workspace_id"
    `);
    await queryRunner.query(`
      UPDATE "conversation_events" e
      SET "conversation_id" = c."local_id"
      FROM "conversations" c
      WHERE e."conversation_id" = c."id"
        AND e."workspace_id" = c."workspace_id"
    `);
    await queryRunner.query(`
      UPDATE "product_suggestions" s
      SET "conversation_id" = c."local_id"
      FROM "conversations" c
      WHERE s."conversation_id" = c."id"
        AND s."workspace_id" = c."workspace_id"
    `);
    await queryRunner.query(`
      UPDATE "chat_auto_distribution_logs" l
      SET "conversation_id" = c."local_id"
      FROM "conversations" c
      WHERE l."conversation_id" = c."id"
        AND l."workspace_id" = c."workspace_id"
    `);
    await queryRunner.query(`
      UPDATE "orders" o
      SET "conversation_id" = c."local_id"
      FROM "conversations" c
      WHERE o."conversation_id" = c."id"
        AND o."workspace_id" = c."workspace_id"
    `);
    await queryRunner.query(`
      UPDATE "client_wishlist_items" w
      SET "conversation_id" = c."local_id"
      FROM "conversations" c
      WHERE w."conversation_id" = c."id"
        AND w."workspace_id" = c."workspace_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "conversations" DROP CONSTRAINT "PK_conversations"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations" DROP COLUMN "id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations" RENAME COLUMN "local_id" TO "id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ALTER COLUMN "id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "PK_conversations" PRIMARY KEY ("workspace_id", "id")
    `);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "conversations_id_seq"`);

    // Composite FKs
    await queryRunner.query(`
      ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "FK_conversation_messages_conversation"
        FOREIGN KEY ("workspace_id", "conversation_id")
        REFERENCES "conversations"("workspace_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_events"
      ADD CONSTRAINT "FK_conversation_events_conversation"
        FOREIGN KEY ("workspace_id", "conversation_id")
        REFERENCES "conversations"("workspace_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "product_suggestions"
      ADD CONSTRAINT "FK_product_suggestions_conversation"
        FOREIGN KEY ("workspace_id", "conversation_id")
        REFERENCES "conversations"("workspace_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_auto_distribution_logs"
      ADD CONSTRAINT "FK_chat_auto_distribution_logs_conversation"
        FOREIGN KEY ("workspace_id", "conversation_id")
        REFERENCES "conversations"("workspace_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    // Cannot use ON DELETE SET NULL: workspace_id is NOT NULL (order PK).
    // App nulls conversation_id before hard-deleting the conversation.
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_conversation"
        FOREIGN KEY ("workspace_id", "conversation_id")
        REFERENCES "conversations"("workspace_id", "id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_messages_workspace_conversation"
      ON "conversation_messages" ("workspace_id", "conversation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_events_workspace_conversation"
      ON "conversation_events" ("workspace_id", "conversation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_suggestions_workspace_conversation"
      ON "product_suggestions" ("workspace_id", "conversation_id")
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_conversation_sequences" ("workspace_id", "next_conversation_id")
      SELECT
        w."id",
        GREATEST(
          COALESCE(
            (SELECT MAX(c."id") + 1 FROM "conversations" c WHERE c."workspace_id" = w."id"),
            ${CONVERSATION_ID_SEQUENCE_START}
          ),
          ${CONVERSATION_ID_SEQUENCE_START}
        )
      FROM "workspace" w
      ON CONFLICT ("workspace_id") DO NOTHING
    `);
  }

  public async down(): Promise<void> {
    // Non-reversible: global serial ids cannot be restored safely.
  }
}
