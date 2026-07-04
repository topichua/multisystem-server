import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryStatusWaybillCreated1744200000110 implements MigrationInterface {
  name = "OrderDeliveryStatusWaybillCreated1744200000110";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "orders_delivery_status_enum"
      ADD VALUE IF NOT EXISTS 'waybill_created' AFTER 'pending'
    `);
    await queryRunner.query(`
      ALTER TYPE "orders_delivery_status_enum"
      ADD VALUE IF NOT EXISTS 'at_branch' AFTER 'shipped'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
  }
}
