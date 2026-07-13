import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoleIntegrationGrantCanTakeChat1744200000105 implements MigrationInterface {
  name = "WorkspaceRoleIntegrationGrantCanTakeChat1744200000105";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_role_integration_grants"
      ADD COLUMN "conversations_can_take_chat" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_role_integration_grants"
      DROP COLUMN "conversations_can_take_chat"
    `);
  }
}
