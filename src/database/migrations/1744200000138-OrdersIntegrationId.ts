import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrdersIntegrationId1744200000138 implements MigrationInterface {
  name = "OrdersIntegrationId1744200000138";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "integration_id" integer
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "integration_id" = c."external_source_id"::integer
      FROM "conversations" c
      WHERE o."conversation_id" = c."id"
        AND c."source" = 2
        AND c."external_source_id" ~ '^[0-9]+$'
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "integration_id" = i."id"
      FROM "conversations" c
      INNER JOIN "instagram_integration" i
        ON i."workspace_id" = o."workspace_id"
        AND (
          i."page_id" = c."external_source_id"
          OR i."instagram_account_id" = c."external_source_id"
        )
      WHERE o."conversation_id" = c."id"
        AND c."source" = 1
        AND o."integration_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_integration_id"
      ON "orders" ("integration_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_integration_id"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN "integration_id"
    `);
  }
}
