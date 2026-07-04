import { MigrationInterface, QueryRunner } from "typeorm";

export class DeliveryStatusFailedAndNovaPoshtaOrderStatusMapping1744200000111 implements MigrationInterface {
  name = "DeliveryStatusFailedAndNovaPoshtaOrderStatusMapping1744200000111";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "orders_delivery_status_enum"
      ADD VALUE IF NOT EXISTS 'delivery_failed' BEFORE 'returned'
    `);

    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD COLUMN "on_created_order_status_id" integer,
      ADD COLUMN "on_in_transit_order_status_id" integer,
      ADD COLUMN "on_arrived_order_status_id" integer,
      ADD COLUMN "on_delivered_order_status_id" integer,
      ADD COLUMN "on_returned_order_status_id" integer,
      ADD COLUMN "on_delivery_failed_order_status_id" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP COLUMN IF EXISTS "on_created_order_status_id",
      DROP COLUMN IF EXISTS "on_in_transit_order_status_id",
      DROP COLUMN IF EXISTS "on_arrived_order_status_id",
      DROP COLUMN IF EXISTS "on_delivered_order_status_id",
      DROP COLUMN IF EXISTS "on_returned_order_status_id",
      DROP COLUMN IF EXISTS "on_delivery_failed_order_status_id"
    `);
  }
}
