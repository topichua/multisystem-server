import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoStatusFields1744200000088 implements MigrationInterface {
  name = "OrderDeliveryInfoStatusFields1744200000088";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "delivery_status" "orders_delivery_status_enum" NOT NULL DEFAULT 'pending',
      ADD COLUMN "provider_status_code" character varying(32),
      ADD COLUMN "provider_status_text" character varying(512),
      ADD COLUMN "provider_document_ref" character varying(255),
      ADD COLUMN "street_ref" character varying(255)
    `);

    await queryRunner.query(`
      UPDATE "order_delivery_infos" AS odi
      SET "delivery_status" = o."delivery_status"
      FROM "orders" AS o
      WHERE o."id" = odi."order_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN "raw_provider_payload"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN "delivery_status"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "delivery_status" "orders_delivery_status_enum" NOT NULL DEFAULT 'pending'
    `);

    await queryRunner.query(`
      UPDATE "orders" AS o
      SET "delivery_status" = odi."delivery_status"
      FROM "order_delivery_infos" AS odi
      WHERE odi."order_id" = o."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "raw_provider_payload" jsonb,
      DROP COLUMN "street_ref",
      DROP COLUMN "provider_document_ref",
      DROP COLUMN "provider_status_text",
      DROP COLUMN "provider_status_code",
      DROP COLUMN "delivery_status"
    `);
  }
}
