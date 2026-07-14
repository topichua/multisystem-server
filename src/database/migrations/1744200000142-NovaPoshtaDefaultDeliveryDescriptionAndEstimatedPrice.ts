import { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaDefaultDeliveryDescriptionAndEstimatedPrice1744200000142
  implements MigrationInterface
{
  name = "NovaPoshtaDefaultDeliveryDescriptionAndEstimatedPrice1744200000142";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD COLUMN "default_delivery_description" character varying(512),
      ADD COLUMN "estimated_delivery_price_fixed" numeric(14, 2),
      ADD COLUMN "estimated_delivery_price_take_from_order" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP COLUMN IF EXISTS "estimated_delivery_price_take_from_order",
      DROP COLUMN IF EXISTS "estimated_delivery_price_fixed",
      DROP COLUMN IF EXISTS "default_delivery_description"
    `);
  }
}
