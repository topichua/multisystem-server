import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceDefaultCurrency1744200000030 implements MigrationInterface {
  name = "WorkspaceDefaultCurrency1744200000030";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN "default_currency" character varying(8) NOT NULL DEFAULT 'UAH'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspace" DROP COLUMN "default_currency"`,
    );
  }
}
