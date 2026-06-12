import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoleIntegrationGrantPermissions1744200000066 implements MigrationInterface {
  name = "WorkspaceRoleIntegrationGrantPermissions1744200000066";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_role_integration_grants"
      ADD COLUMN "conversations_read_scope" character varying(8) NOT NULL DEFAULT 'mine',
      ADD COLUMN "conversations_write_scope" character varying(8) NOT NULL DEFAULT 'mine',
      ADD COLUMN "instagram_comments_read" boolean NOT NULL DEFAULT false,
      ADD COLUMN "instagram_comments_write" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_role_integration_grants"
      DROP COLUMN "instagram_comments_write",
      DROP COLUMN "instagram_comments_read",
      DROP COLUMN "conversations_write_scope",
      DROP COLUMN "conversations_read_scope"
    `);
  }
}
