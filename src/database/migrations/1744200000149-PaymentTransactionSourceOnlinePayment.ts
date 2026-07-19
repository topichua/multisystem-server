import type { MigrationInterface, QueryRunner } from "typeorm";

export class PaymentTransactionSourceOnlinePayment1744200000149
  implements MigrationInterface
{
  name = "PaymentTransactionSourceOnlinePayment1744200000149";

  /** Enum ADD VALUE must commit before the value can be used in later SQL. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "payment_transaction_source_enum"
      ADD VALUE IF NOT EXISTS 'online_payment'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values safely.
  }
}
