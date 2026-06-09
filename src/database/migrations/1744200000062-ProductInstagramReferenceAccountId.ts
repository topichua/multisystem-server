import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductInstagramReferenceAccountId1744200000062 implements MigrationInterface {
  name = "ProductInstagramReferenceAccountId1744200000062";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      ADD COLUMN "instagram_account_id" character varying(255)
    `);

    await queryRunner.query(`
      UPDATE "product_instagram_references" r
      SET "instagram_account_id" = i."instagram_account_id"
      FROM "instagram_integration" i
      WHERE i."id" = r."instagram_integration_id"
        AND i."instagram_account_id" IS NOT NULL
        AND TRIM(i."instagram_account_id") <> ''
    `);

    await queryRunner.query(`
      DELETE FROM "product_instagram_references"
      WHERE "instagram_account_id" IS NULL
        OR TRIM("instagram_account_id") = ''
    `);

    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      ALTER COLUMN "instagram_account_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      DROP CONSTRAINT IF EXISTS "FK_product_instagram_references_instagram_integration_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      DROP COLUMN "instagram_integration_id"
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_instagram_references_instagram_account_id" ON "product_instagram_references" ("instagram_account_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_instagram_references_instagram_account_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      ADD COLUMN "instagram_integration_id" integer
    `);
    await queryRunner.query(`
      UPDATE "product_instagram_references" r
      SET "instagram_integration_id" = i."id"
      FROM "instagram_integration" i
      WHERE i."instagram_account_id" = r."instagram_account_id"
        AND i."workspace_id" = r."workspace_id"
    `);
    await queryRunner.query(`
      DELETE FROM "product_instagram_references"
      WHERE "instagram_integration_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      ALTER COLUMN "instagram_integration_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      ADD CONSTRAINT "FK_product_instagram_references_instagram_integration_id"
      FOREIGN KEY ("instagram_integration_id")
      REFERENCES "instagram_integration"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "product_instagram_references"
      DROP COLUMN "instagram_account_id"
    `);
  }
}
