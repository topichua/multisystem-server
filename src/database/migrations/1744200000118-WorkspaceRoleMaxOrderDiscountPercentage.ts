import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoleMaxOrderDiscountPercentage1744200000118 implements MigrationInterface {
  name = "WorkspaceRoleMaxOrderDiscountPercentage1744200000118";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      ADD COLUMN IF NOT EXISTS "max_order_discount_percentage" numeric(5,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      DROP COLUMN IF EXISTS "max_order_discount_percentage"
    `);
  }
}
