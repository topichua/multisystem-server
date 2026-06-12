import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceMemberCanBeAssignedToChat1744200000068 implements MigrationInterface {
  name = "WorkspaceMemberCanBeAssignedToChat1744200000068";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD COLUMN "can_be_assigned_to_chat" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP COLUMN "can_be_assigned_to_chat"
    `);
  }
}
