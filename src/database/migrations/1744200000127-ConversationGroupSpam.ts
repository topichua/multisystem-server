import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationGroupSpam1744200000127 implements MigrationInterface {
  name = "ConversationGroupSpam1744200000127";

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      ["Спам", "#EF4444", 3, "spam"],
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    /* Data repair migration — no down. */
  }
}
