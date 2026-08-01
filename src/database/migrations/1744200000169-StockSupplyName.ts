import { MigrationInterface, QueryRunner } from "typeorm";

export class StockSupplyName1744200000169 implements MigrationInterface {
  name = "StockSupplyName1744200000169";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_supplies"
      ADD COLUMN IF NOT EXISTS "name" character varying(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_supplies"
      DROP COLUMN IF EXISTS "name"
    `);
  }
}
