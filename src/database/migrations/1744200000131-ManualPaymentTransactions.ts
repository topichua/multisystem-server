import { MigrationInterface, QueryRunner } from "typeorm";

export class ManualPaymentTransactions1744200000131 implements MigrationInterface {
  name = "ManualPaymentTransactions1744200000131";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "payment_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "provider" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ADD COLUMN "note" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" DROP COLUMN IF EXISTS "note"
    `);
    await queryRunner.query(`
      DELETE FROM "payment_transactions" WHERE "payment_id" IS NULL OR "provider" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "provider" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "payment_id" SET NOT NULL
    `);
  }
}
