import type { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaIntegrationDeliveryType1744200000146
  implements MigrationInterface
{
  name = "NovaPoshtaIntegrationDeliveryType1744200000146";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD COLUMN "delivery_type" character varying(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP COLUMN IF EXISTS "delivery_type"
    `);
  }
}
