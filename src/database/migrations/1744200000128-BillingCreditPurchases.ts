import { MigrationInterface, QueryRunner } from "typeorm";

export class BillingCreditPurchases1744200000128 implements MigrationInterface {
  name = "BillingCreditPurchases1744200000128";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_entitlements"
      ADD COLUMN "ai_credits_purchased" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE "billing_credit_pricing" (
        "id" SERIAL NOT NULL,
        "price_per_credit" numeric(14,4) NOT NULL DEFAULT 1,
        "currency" character varying(8) NOT NULL DEFAULT 'UAH',
        "min_purchase_credits" integer NOT NULL DEFAULT 10,
        "max_purchase_credits" integer,
        "is_active" boolean NOT NULL DEFAULT true,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_credit_pricing" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "billing_credit_pricing" (
        "price_per_credit",
        "currency",
        "min_purchase_credits",
        "max_purchase_credits",
        "is_active"
      )
      VALUES (1, 'UAH', 10, 100000, true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "billing_credit_pricing"`);
    await queryRunner.query(`
      ALTER TABLE "workspace_entitlements"
      DROP COLUMN "ai_credits_purchased"
    `);
  }
}
