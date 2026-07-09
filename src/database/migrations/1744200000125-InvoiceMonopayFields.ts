import { MigrationInterface, QueryRunner } from "typeorm";

export class InvoiceMonopayFields1744200000125 implements MigrationInterface {
  name = "InvoiceMonopayFields1744200000125";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN "payment_page_url" text,
      ADD COLUMN "payment_provider" character varying(32),
      ADD COLUMN "payment_provider_modified_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      DROP COLUMN IF EXISTS "payment_provider_modified_at",
      DROP COLUMN IF EXISTS "payment_provider",
      DROP COLUMN IF EXISTS "payment_page_url"
    `);
  }
}
