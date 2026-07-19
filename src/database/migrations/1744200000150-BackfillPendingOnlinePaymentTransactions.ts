import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Backfill pending/processing online payment requests that have no ledger row yet.
 * Must run after `online_payment` exists on `payment_transaction_source_enum`.
 */
export class BackfillPendingOnlinePaymentTransactions1744200000150
  implements MigrationInterface
{
  name = "BackfillPendingOnlinePaymentTransactions1744200000150";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "payment_transactions" (
        "workspace_id",
        "order_id",
        "payment_id",
        "provider",
        "note",
        "manual_payment_method_id",
        "type",
        "amount",
        "currency",
        "status",
        "source",
        "external_transaction_id",
        "confirmed_by_id",
        "occurred_at",
        "created_at"
      )
      SELECT
        pr."workspace_id",
        pr."order_id",
        pr."id",
        pr."provider",
        NULL,
        NULL,
        'charge',
        pr."amount",
        pr."currency",
        'pending',
        'online_payment',
        NULL,
        NULL,
        pr."created_at",
        now()
      FROM "payment_requests" pr
      WHERE pr."status" IN ('pending', 'processing')
        AND NOT EXISTS (
          SELECT 1
          FROM "payment_transactions" pt
          WHERE pt."payment_id" = pr."id"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "payment_transactions" pt
      USING "payment_requests" pr
      WHERE pt."payment_id" = pr."id"
        AND pt."source" = 'online_payment'
        AND pt."status" = 'pending'
        AND pr."status" IN ('pending', 'processing')
    `);
  }
}
