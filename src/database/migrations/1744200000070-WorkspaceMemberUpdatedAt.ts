import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceMemberUpdatedAt1744200000070 implements MigrationInterface {
  name = "WorkspaceMemberUpdatedAt1744200000070";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP COLUMN "updated_at"
    `);
  }
}
