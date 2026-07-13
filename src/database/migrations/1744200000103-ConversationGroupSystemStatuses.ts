import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationGroupSystemStatuses1744200000103 implements MigrationInterface {
  name = "ConversationGroupSystemStatuses1744200000103";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD COLUMN "system_key" varchar(32)
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD COLUMN "is_system" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_conversation_groups_workspace_system_key"
      ON "conversation_groups" ("workspace_id", "system_key")
      WHERE "system_key" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "conversation_events" (
        "id" SERIAL NOT NULL,
        "conversation_id" integer NOT NULL,
        "type" varchar(64) NOT NULL,
        "actor_id" integer,
        "payload" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversation_events_conversation_id"
          FOREIGN KEY ("conversation_id")
          REFERENCES "conversations" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_conversation_events_actor_id"
          FOREIGN KEY ("actor_id")
          REFERENCES "users" ("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_events_conversation_id"
      ON "conversation_events" ("conversation_id")
    `);

    for (const row of [
      { key: "new", name: "Новий", color: "#3B82F6", sort: 0 },
      { key: "processing", name: "Обробка", color: "#F59E0B", sort: 1 },
      { key: "archived", name: "Архів", color: "#6B7280", sort: 2 },
    ]) {
      await queryRunner.query(
        `
        INSERT INTO "conversation_groups" (
          "workspace_id",
          "name",
          "description",
          "color",
          "created_at",
          "created_by_id",
          "sort_order",
          "system_key",
          "is_system"
        )
        SELECT
          w."id",
          $1,
          NULL,
          $2,
          now(),
          NULL,
          $3,
          $4::varchar(32),
          true
        FROM "workspace" w
        WHERE NOT EXISTS (
          SELECT 1
          FROM "conversation_groups" cg
          WHERE cg."workspace_id" = w."id"
            AND cg."system_key" = $4::varchar(32)
        )
        `,
        [row.name, row.color, row.sort, row.key],
      );
    }

    await queryRunner.query(`
      UPDATE "conversations" c
      SET "group_id" = cg."id"
      FROM "conversation_groups" cg
      WHERE c."group_id" IS NULL
        AND cg."workspace_id" = c."workspace_id"
        AND cg."system_key" = 'new'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_conversation_events_conversation_id"
    `);
    await queryRunner.query(`
      DROP TABLE "conversation_events"
    `);
    await queryRunner.query(`
      DELETE FROM "conversation_groups"
      WHERE "is_system" = true
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_conversation_groups_workspace_system_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      DROP COLUMN "is_system"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      DROP COLUMN "system_key"
    `);
  }
}
