import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceMemberIntegrationScopes1744200000040 implements MigrationInterface {
  name = "WorkspaceMemberIntegrationScopes1744200000040";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD COLUMN "integration_scopes" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP COLUMN IF EXISTS "integration_scopes"
    `);
  }
}
