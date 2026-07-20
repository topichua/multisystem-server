import { MigrationInterface, QueryRunner } from "typeorm";

export class InstagramIntegrationWorkspacePageUnique1744200000159
  implements MigrationInterface
{
  name = "InstagramIntegrationWorkspacePageUnique1744200000159";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the newest row when the same Page was connected more than once.
    await queryRunner.query(`
      DELETE FROM "instagram_integration" AS older
      USING "instagram_integration" AS newer
      WHERE
        older."workspace_id" = newer."workspace_id"
        AND older."page_id" = newer."page_id"
        AND older."id" < newer."id"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instagram_integration_workspace_page"
      ON "instagram_integration" ("workspace_id", "page_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_instagram_integration_workspace_page"
    `);
  }
}
