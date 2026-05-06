import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductCategoriesCreatedBySoftDelete1744200000026 implements MigrationInterface {
  name = "ProductCategoriesCreatedBySoftDelete1744200000026";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_categories_workspace_root_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_categories_workspace_parent_name"`,
    );

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD COLUMN "created_by_user_id" integer
    `);
    await queryRunner.query(`
      UPDATE "product_categories" pc
      SET "created_by_user_id" = w."owner_id"
      FROM "workspace" w
      WHERE w."id" = pc."workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ALTER COLUMN "created_by_user_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "FK_product_categories_created_by_user_id"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD COLUMN "deleted_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD COLUMN "deleted_by_user_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "FK_product_categories_deleted_by_user_id"
      FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_categories_workspace_root_name"
      ON "product_categories" ("workspace_id", "name")
      WHERE "parent_id" IS NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_categories_workspace_parent_name"
      ON "product_categories" ("workspace_id", "parent_id", "name")
      WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_categories_workspace_root_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_product_categories_workspace_parent_name"`,
    );

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      DROP CONSTRAINT IF EXISTS "FK_product_categories_deleted_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "deleted_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "deleted_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      DROP CONSTRAINT IF EXISTS "FK_product_categories_created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "created_by_user_id"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_categories_workspace_root_name"
      ON "product_categories" ("workspace_id", "name")
      WHERE "parent_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_categories_workspace_parent_name"
      ON "product_categories" ("workspace_id", "parent_id", "name")
      WHERE "parent_id" IS NOT NULL
    `);
  }
}
