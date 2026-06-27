import { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaIntegrationSenderSettings1744200000078 implements MigrationInterface {
  name = "NovaPoshtaIntegrationSenderSettings1744200000078";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD COLUMN "sender_name" character varying(255),
      ADD COLUMN "sender_phone" character varying(64),
      ADD COLUMN "sender_city_ref" character varying(255),
      ADD COLUMN "sender_city_name" character varying(255),
      ADD COLUMN "sender_type" character varying(32),
      ADD COLUMN "sender_warehouse_ref" character varying(255),
      ADD COLUMN "sender_warehouse_name" character varying(512),
      ADD COLUMN "sender_street_ref" character varying(255),
      ADD COLUMN "sender_street_name" character varying(255),
      ADD COLUMN "sender_building" character varying(64),
      ADD COLUMN "sender_flat" character varying(64),
      ADD COLUMN "sender_ref" character varying(255),
      ADD COLUMN "sender_contact_ref" character varying(255),
      ADD COLUMN "payment_method" character varying(32),
      ADD COLUMN "payer_type" character varying(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP COLUMN IF EXISTS "sender_name",
      DROP COLUMN IF EXISTS "sender_phone",
      DROP COLUMN IF EXISTS "sender_city_ref",
      DROP COLUMN IF EXISTS "sender_city_name",
      DROP COLUMN IF EXISTS "sender_type",
      DROP COLUMN IF EXISTS "sender_warehouse_ref",
      DROP COLUMN IF EXISTS "sender_warehouse_name",
      DROP COLUMN IF EXISTS "sender_street_ref",
      DROP COLUMN IF EXISTS "sender_street_name",
      DROP COLUMN IF EXISTS "sender_building",
      DROP COLUMN IF EXISTS "sender_flat",
      DROP COLUMN IF EXISTS "sender_ref",
      DROP COLUMN IF EXISTS "sender_contact_ref",
      DROP COLUMN IF EXISTS "payment_method",
      DROP COLUMN IF EXISTS "payer_type"
    `);
  }
}
