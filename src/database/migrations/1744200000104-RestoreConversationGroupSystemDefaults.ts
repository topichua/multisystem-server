import { MigrationInterface, QueryRunner } from "typeorm";

export class RestoreConversationGroupSystemDefaults1744200000104
  implements MigrationInterface
{
  name = "RestoreConversationGroupSystemDefaults1744200000104";

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      UPDATE "conversation_groups"
      SET "is_system" = true
      WHERE "system_key" IN ('new', 'processing', 'archived')
        AND "is_system" = false
    `);

    await queryRunner.query(`
      UPDATE "conversations" c
      SET "group_id" = cg."id"
      FROM "conversation_groups" cg
      WHERE c."group_id" IS NULL
        AND cg."workspace_id" = c."workspace_id"
        AND cg."system_key" = 'new'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    /* Data repair migration — no down. */
  }
}
