import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderSourceMobile1744200000116 implements MigrationInterface {
  name = "OrderSourceMobile1744200000116";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "orders_order_source_enum"
      ADD VALUE IF NOT EXISTS 'mobile'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
  }
}
