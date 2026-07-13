import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusAutomationConditions1744200000136
  implements MigrationInterface
{
  name = "OrderStatusAutomationConditions1744200000136";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "order_status_automation_conditions" (
        "id" SERIAL NOT NULL,
        "automation_id" integer NOT NULL,
        "source_type" "automation_source_type_enum" NOT NULL,
        "source_status" character varying(64) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_order_status_automation_conditions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_status_automation_conditions_automation"
          FOREIGN KEY ("automation_id") REFERENCES "order_status_automations"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_order_status_automation_conditions_automation_source"
          UNIQUE ("automation_id", "source_type", "source_status")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_status_automation_conditions_lookup"
      ON "order_status_automation_conditions" ("source_type", "source_status")
    `);

    await queryRunner.query(`
      INSERT INTO "order_status_automation_conditions" (
        "automation_id", "source_type", "source_status", "sort_order"
      )
      SELECT "id", "source_type", "source_status", 0
      FROM "order_status_automations"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN "source_type",
      DROP COLUMN "source_status"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN "source_type" "automation_source_type_enum",
      ADD COLUMN "source_status" character varying(64)
    `);
    await queryRunner.query(`
      UPDATE "order_status_automations" a
      SET
        "source_type" = c."source_type",
        "source_status" = c."source_status"
      FROM (
        SELECT DISTINCT ON ("automation_id")
          "automation_id", "source_type", "source_status"
        FROM "order_status_automation_conditions"
        ORDER BY "automation_id", "sort_order" ASC, "id" ASC
      ) c
      WHERE a."id" = c."automation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ALTER COLUMN "source_type" SET NOT NULL,
      ALTER COLUMN "source_status" SET NOT NULL
    `);
    await queryRunner.query(`DROP TABLE "order_status_automation_conditions"`);
  }
}
