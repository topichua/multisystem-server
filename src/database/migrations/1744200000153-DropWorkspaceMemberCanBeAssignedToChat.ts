import { MigrationInterface, QueryRunner } from "typeorm";

export class DropWorkspaceMemberCanBeAssignedToChat1744200000153 implements MigrationInterface {
  name = "DropWorkspaceMemberCanBeAssignedToChat1744200000153";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP COLUMN "can_be_assigned_to_chat"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD COLUMN "can_be_assigned_to_chat" boolean NOT NULL DEFAULT true
    `);
  }
}
