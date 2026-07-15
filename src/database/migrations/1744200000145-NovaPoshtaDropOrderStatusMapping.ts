import type { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaDropOrderStatusMapping1744200000145
  implements MigrationInterface
{
  name = "NovaPoshtaDropOrderStatusMapping1744200000145";

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
