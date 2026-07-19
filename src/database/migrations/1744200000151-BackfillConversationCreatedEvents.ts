import type { MigrationInterface, QueryRunner } from "typeorm";

/** Adds the initial audit event for conversations created before this event existed. */
export class BackfillConversationCreatedEvents1744200000151
  implements MigrationInterface
{
  name = "BackfillConversationCreatedEvents1744200000151";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "conversation_events" (
        "conversation_id",
        "type",
        "actor_id",
        "payload",
        "created_at"
      )
      SELECT
        c."id",
        'conversation_created',
        NULL,
        jsonb_build_object(
          'workspaceId', c."workspace_id",
          'source', c."source",
          'externalSourceId', c."external_source_id",
          'externalId', c."external_id",
          'conversationCreatedAt', to_char(
            c."created_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ),
        c."created_at"
      FROM "conversations" c
      WHERE NOT EXISTS (
        SELECT 1
        FROM "conversation_events" ce
        WHERE ce."conversation_id" = c."id"
          AND ce."type" = 'conversation_created'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "conversation_events"
      WHERE "type" = 'conversation_created'
        AND "actor_id" IS NULL
    `);
  }
}
