import { MigrationInterface, QueryRunner } from "typeorm";

export class StockMovementReasonText1744200000097
  implements MigrationInterface
{
  name = "StockMovementReasonText1744200000097";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ALTER COLUMN "reason" TYPE varchar(255)
      USING "reason"::text
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stock_movement_reason_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "stock_movement_reason_enum" AS ENUM (
        'damaged',
        'lost',
        'found',
        'manual',
        'inventory_count',
        'other'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ALTER COLUMN "reason" TYPE "stock_movement_reason_enum"
      USING CASE
        WHEN "reason" IS NULL THEN NULL
        WHEN "reason" IN ('damaged', 'lost', 'found', 'manual', 'inventory_count', 'other')
          THEN "reason"::"stock_movement_reason_enum"
        ELSE 'other'::"stock_movement_reason_enum"
      END
    `);
  }
}
