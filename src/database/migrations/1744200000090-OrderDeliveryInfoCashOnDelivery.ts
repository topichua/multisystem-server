import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoCashOnDelivery1744200000090 implements MigrationInterface {
  name = "OrderDeliveryInfoCashOnDelivery1744200000090";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "is_cash_on_delivery" boolean NOT NULL DEFAULT false,
      ADD COLUMN "cash_on_delivery_amount" numeric(14, 2),
      ADD CONSTRAINT "CHK_order_delivery_infos_cod_amount_non_negative"
        CHECK (
          "cash_on_delivery_amount" IS NULL OR "cash_on_delivery_amount" >= 0
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP CONSTRAINT "CHK_order_delivery_infos_cod_amount_non_negative",
      DROP COLUMN "cash_on_delivery_amount",
      DROP COLUMN "is_cash_on_delivery"
    `);
  }
}
