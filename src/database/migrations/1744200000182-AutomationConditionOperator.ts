import type { MigrationInterface, QueryRunner } from "typeorm";

export class AutomationConditionOperator1744200000182
  implements MigrationInterface
{
  name = "AutomationConditionOperator1744200000182";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "automation_condition_operator_enum" AS ENUM ('EQ', 'NEQ')
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_conditions"
      ADD COLUMN "operator" "automation_condition_operator_enum" NOT NULL DEFAULT 'EQ'
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_conditions"
      DROP CONSTRAINT IF EXISTS "UQ_order_status_automation_conditions_automation_source"
    `);
    // TypeORM may have created a hashed unique name — drop by column set if present
    await queryRunner.query(`
      DO $$
      DECLARE
        cname text;
      BEGIN
        SELECT tc.constraint_name INTO cname
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_name = tc.table_name
        WHERE tc.table_name = 'order_status_automation_conditions'
          AND tc.constraint_type = 'UNIQUE'
        GROUP BY tc.constraint_name
        HAVING COUNT(*) = 3
           AND bool_and(ccu.column_name IN ('automation_id', 'source_type', 'source_status'));
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE order_status_automation_conditions DROP CONSTRAINT %I', cname);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_order_status_automation_conditions_automation_source_op"
      ON "order_status_automation_conditions"
        ("automation_id", "source_type", "source_status", "operator")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_order_status_automation_conditions_automation_source_op"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_conditions"
      DROP COLUMN IF EXISTS "operator"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "automation_condition_operator_enum"
    `);
  }
}
