import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoPayerTypeAndDeliveryPrice1744200000143
  implements MigrationInterface
{
  name = "OrderDeliveryInfoPayerTypeAndDeliveryPrice1744200000143";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "payer_type" character varying(32),
      ADD COLUMN "delivery_price" numeric(14, 2),
      ADD CONSTRAINT "CHK_order_delivery_infos_delivery_price_non_negative"
        CHECK (
          "delivery_price" IS NULL OR "delivery_price" >= 0
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP CONSTRAINT IF EXISTS "CHK_order_delivery_infos_delivery_price_non_negative",
      DROP COLUMN IF EXISTS "delivery_price",
      DROP COLUMN IF EXISTS "payer_type"
    `);
  }
}
