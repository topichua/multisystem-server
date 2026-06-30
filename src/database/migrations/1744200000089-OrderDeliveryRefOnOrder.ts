import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderDeliveryRefOnOrder1744200000089 implements MigrationInterface {
  name = "OrderDeliveryRefOnOrder1744200000089";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "delivery_id" integer,
      ADD COLUMN "delivery_type" "order_delivery_provider_enum"
    `);

    await queryRunner.query(`
      UPDATE "orders" AS o
      SET
        "delivery_id" = odi."id",
        "delivery_type" = odi."provider"
      FROM "order_delivery_infos" AS odi
      WHERE odi."order_id" = o."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP CONSTRAINT "FK_order_delivery_infos_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP CONSTRAINT "UQ_order_delivery_infos_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      DROP COLUMN "order_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD COLUMN "order_id" integer
    `);

    await queryRunner.query(`
      UPDATE "order_delivery_infos" AS odi
      SET "order_id" = o."id"
      FROM "orders" AS o
      WHERE
        o."delivery_id" = odi."id"
        AND o."delivery_type" = odi."provider"
    `);

    await queryRunner.query(`
      DELETE FROM "order_delivery_infos"
      WHERE "order_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ALTER COLUMN "order_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD CONSTRAINT "UQ_order_delivery_infos_order_id" UNIQUE ("order_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "order_delivery_infos"
      ADD CONSTRAINT "FK_order_delivery_infos_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN "delivery_type",
      DROP COLUMN "delivery_id"
    `);
  }
}
