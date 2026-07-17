import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoSyncedFromTrackingManually1744200000147
  implements MigrationInterface
{
  name = "OrderDeliveryInfoSyncedFromTrackingManually1744200000147";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "synced_from_tracking_manually" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN IF EXISTS "synced_from_tracking_manually"
    `);
  }
}
