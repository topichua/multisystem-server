import { MigrationInterface, QueryRunner } from "typeorm";

export class ManualPaymentMethods1744200000132 implements MigrationInterface {
  name = "ManualPaymentMethods1744200000132";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "manual_payment_method_type_enum" AS ENUM ('iban', 'card')
    `);

    await queryRunner.query(`
      CREATE TABLE "manual_payment_methods" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "name" character varying(120) NOT NULL,
        "type" "manual_payment_method_type_enum" NOT NULL,
        "value" character varying(64) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_manual_payment_methods" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manual_payment_methods_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_manual_payment_methods_workspace_id"
      ON "manual_payment_methods" ("workspace_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "manual_payment_method_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_manual_payment_method_id"
      FOREIGN KEY ("manual_payment_method_id")
      REFERENCES "manual_payment_methods"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ADD COLUMN "manual_payment_method_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ADD CONSTRAINT "FK_payment_transactions_manual_payment_method_id"
      FOREIGN KEY ("manual_payment_method_id")
      REFERENCES "manual_payment_methods"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      DROP CONSTRAINT IF EXISTS "FK_payment_transactions_manual_payment_method_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      DROP COLUMN IF EXISTS "manual_payment_method_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP CONSTRAINT IF EXISTS "FK_orders_manual_payment_method_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "manual_payment_method_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "manual_payment_methods"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "manual_payment_method_type_enum"`);
  }
}
