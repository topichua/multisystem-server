import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusAutomationConditionType1744200000144
  implements MigrationInterface
{
  name = "OrderStatusAutomationConditionType1744200000144";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "automation_condition_type_enum" AS ENUM ('OR', 'AND')
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN "condition_type" "automation_condition_type_enum" NOT NULL DEFAULT 'OR'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN IF EXISTS "condition_type"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "automation_condition_type_enum"
    `);
  }
}
