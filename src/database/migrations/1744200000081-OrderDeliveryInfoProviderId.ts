import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoProviderId1744200000081 implements MigrationInterface {
  name = "OrderDeliveryInfoProviderId1744200000081";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "provider_id" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN "provider_id"
    `);
  }
}
