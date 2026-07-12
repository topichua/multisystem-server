import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoStatusCodeAt1744200000133 implements MigrationInterface {
  name = "OrderDeliveryInfoStatusCodeAt1744200000133";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "delivery_status_code_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN "delivery_status_code_at"
    `);
  }
}
