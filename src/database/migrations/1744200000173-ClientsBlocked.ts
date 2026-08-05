import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientsBlocked1744200000173 implements MigrationInterface {
  name = "ClientsBlocked1744200000173";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN IF NOT EXISTS "blocked" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN IF EXISTS "blocked"
    `);
  }
}
