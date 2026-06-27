import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryInfoAddressToStreetFields1744200000079 implements MigrationInterface {
  name = "OrderDeliveryInfoAddressToStreetFields1744200000079";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "order_delivery_destination_type_enum" AS ENUM ('warehouse', 'address')
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN "address",
      ADD COLUMN "street" character varying(255),
      ADD COLUMN "building" character varying(64),
      ADD COLUMN "flat" character varying(64),
      ADD COLUMN "delivery_type" "order_delivery_destination_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN "delivery_type",
      DROP COLUMN "flat",
      DROP COLUMN "building",
      DROP COLUMN "street",
      ADD COLUMN "address" text
    `);
    await queryRunner.query(`
      DROP TYPE "order_delivery_destination_type_enum"
    `);
  }
}
