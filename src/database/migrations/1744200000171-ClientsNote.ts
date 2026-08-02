import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientsNote1744200000171 implements MigrationInterface {
  name = "ClientsNote1744200000171";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN IF NOT EXISTS "note" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN IF EXISTS "note"
    `);
  }
}
