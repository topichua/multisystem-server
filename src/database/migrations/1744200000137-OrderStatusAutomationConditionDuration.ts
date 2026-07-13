import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusAutomationConditionDuration1744200000137
  implements MigrationInterface
{
  name = "OrderStatusAutomationConditionDuration1744200000137";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_conditions"
      ADD COLUMN "duration_value" integer,
      ADD COLUMN "duration_unit" "automation_duration_unit_enum"
    `);

    await queryRunner.query(`
      UPDATE "order_status_automation_conditions" c
      SET
        "duration_value" = a."duration_value",
        "duration_unit" = a."duration_unit"
      FROM "order_status_automations" a
      WHERE c."automation_id" = a."id"
        AND a."duration_value" IS NOT NULL
        AND a."duration_unit" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN "duration_value",
      DROP COLUMN "duration_unit"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN "duration_value" integer,
      ADD COLUMN "duration_unit" "automation_duration_unit_enum"
    `);

    await queryRunner.query(`
      UPDATE "order_status_automations" a
      SET
        "duration_value" = c."duration_value",
        "duration_unit" = c."duration_unit"
      FROM (
        SELECT DISTINCT ON ("automation_id")
          "automation_id", "duration_value", "duration_unit"
        FROM "order_status_automation_conditions"
        WHERE "duration_value" IS NOT NULL
        ORDER BY "automation_id", "sort_order" ASC, "id" ASC
      ) c
      WHERE a."id" = c."automation_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_conditions"
      DROP COLUMN "duration_value",
      DROP COLUMN "duration_unit"
    `);
  }
}
