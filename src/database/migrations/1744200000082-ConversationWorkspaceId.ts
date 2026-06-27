import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationWorkspaceId1744200000082 implements MigrationInterface {
  name = "ConversationWorkspaceId1744200000082";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN "workspace_id" integer NULL
    `);

    await queryRunner.query(`
      UPDATE "conversations" c
      SET "workspace_id" = i."workspace_id"
      FROM "instagram_integration" i
      WHERE c."workspace_id" IS NULL
        AND c."source" = 1
        AND i."owner_id" = c."manager_id"
        AND i."page_id" = c."external_source_id"
    `);

    await queryRunner.query(`
      UPDATE "conversations" c
      SET "workspace_id" = sub."workspace_id"
      FROM (
        SELECT DISTINCT ON (i."owner_id") i."owner_id", i."workspace_id"
        FROM "instagram_integration" i
        ORDER BY i."owner_id", i."id" DESC
      ) sub
      WHERE c."workspace_id" IS NULL
        AND c."source" = 1
        AND sub."owner_id" = c."manager_id"
    `);

    await queryRunner.query(`
      UPDATE "conversations" c
      SET "workspace_id" = t."workspace_id"
      FROM "telegram_integrations" t
      WHERE c."workspace_id" IS NULL
        AND c."source" = 2
        AND c."external_source_id" ~ '^[0-9]+$'
        AND t."id" = c."external_source_id"::integer
    `);

    await queryRunner.query(`
      UPDATE "conversations" c
      SET "workspace_id" = sub."workspace_id"
      FROM (
        SELECT DISTINCT ON (t."owner_id") t."owner_id", t."workspace_id"
        FROM "telegram_integrations" t
        ORDER BY t."owner_id", t."id" DESC
      ) sub
      WHERE c."workspace_id" IS NULL
        AND c."source" = 2
        AND sub."owner_id" = c."manager_id"
    `);

    const [{ c }] = await queryRunner.query(
      `SELECT COUNT(*)::text AS c FROM "conversations" WHERE "workspace_id" IS NULL`,
    );
    if (parseInt(c, 10) > 0) {
      throw new Error(
        "Migration: cannot infer workspace_id for every conversation; fix data and retry.",
      );
    }

    await queryRunner.query(`
      ALTER TABLE "conversations"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_workspace_id"
        FOREIGN KEY ("workspace_id")
        REFERENCES "workspace"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_workspace_id"
      ON "conversations" ("workspace_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_conversations_workspace_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "FK_conversations_workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP COLUMN "workspace_id"
    `);
  }
}
