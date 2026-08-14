import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Wishlist analytics: period KPI on `at`, demand grouped by variant.
 */
export class WishlistAnalyticsIndexes1744200000189 implements MigrationInterface {
  name = "WishlistAnalyticsIndexes1744200000189";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_wishlist_items_workspace_id_at"
      ON "client_wishlist_items" ("workspace_id", "at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_wishlist_items_workspace_id_variant_id"
      ON "client_wishlist_items" ("workspace_id", "variant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_client_wishlist_items_workspace_id_variant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_client_wishlist_items_workspace_id_at"`,
    );
  }
}
