import { MigrationInterface, QueryRunner } from "typeorm";

export class PlanTemplatesTestPricing1744200000126 implements MigrationInterface {
  name = "PlanTemplatesTestPricing1744200000126";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plan_templates"
      SET
        "price_monthly" = 2,
        "price_yearly" = 2,
        "updated_at" = now()
      WHERE "slug" IN ('starter', 'pro')
        AND "workspace_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plan_templates"
      SET
        "price_monthly" = CASE "slug"
          WHEN 'starter' THEN 490
          WHEN 'pro' THEN 1490
          ELSE "price_monthly"
        END,
        "price_yearly" = CASE "slug"
          WHEN 'starter' THEN 4900
          WHEN 'pro' THEN 14900
          ELSE "price_yearly"
        END,
        "updated_at" = now()
      WHERE "slug" IN ('starter', 'pro')
        AND "workspace_id" IS NULL
    `);
  }
}
