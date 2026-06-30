import type { MigrationInterface, QueryRunner } from "typeorm";

export class ClientsDropDeliveryInfo1744200000093 implements MigrationInterface {
  name = "ClientsDropDeliveryInfo1744200000093";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN "delivery_info"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN "delivery_info" text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      ALTER COLUMN "delivery_info" DROP DEFAULT
    `);
  }
}
