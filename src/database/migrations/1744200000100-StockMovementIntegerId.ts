import { MigrationInterface, QueryRunner } from "typeorm";

export class StockMovementIntegerId1744200000100
  implements MigrationInterface
{
  name = "StockMovementIntegerId1744200000100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP CONSTRAINT "PK_stock_movements"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP COLUMN "id"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "id" SERIAL NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP CONSTRAINT "PK_stock_movements"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP COLUMN "id"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "id" uuid NOT NULL DEFAULT gen_random_uuid()
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id")
    `);
  }
}
