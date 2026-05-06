import { MigrationInterface, QueryRunner } from "typeorm";

export class DropProductsCategoriesPivot1744200000028 implements MigrationInterface {
  name = "DropProductsCategoriesPivot1744200000028";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "category_id" integer
    `);

    await queryRunner.query(`
      UPDATE "products" p
      SET "category_id" = sub."category_id"
      FROM (
        SELECT DISTINCT ON ("product_id") "product_id", "category_id"
        FROM "products_categories"
        ORDER BY "product_id", "category_id"
      ) AS sub
      WHERE p."id" = sub."product_id"
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_products_categories_workspace_match" ON "products_categories"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS products_categories_enforce_workspace_match()
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_products_categories_company_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_products_categories_category_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "products_categories"`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION products_enforce_category_workspace_match()
      RETURNS trigger AS $$
      DECLARE
        company_ws integer;
        category_ws integer;
      BEGIN
        IF NEW."category_id" IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT "workspace_id" INTO company_ws
        FROM "integration"
        WHERE "id" = NEW."company_id";
        SELECT "workspace_id" INTO category_ws
        FROM "product_categories"
        WHERE "id" = NEW."category_id";
        IF company_ws IS NULL OR category_ws IS NULL OR company_ws <> category_ws THEN
          RAISE EXCEPTION 'Category must belong to the same workspace as the product company';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_products_category_workspace"
      BEFORE INSERT OR UPDATE ON "products"
      FOR EACH ROW
      EXECUTE PROCEDURE products_enforce_category_workspace_match()
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_category_id"
      FOREIGN KEY ("category_id")
      REFERENCES "product_categories"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_products_category_id" ON "products" ("category_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_category_id"`);
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP CONSTRAINT IF EXISTS "FK_products_category_id"
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_products_category_workspace" ON "products"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS products_enforce_category_workspace_match()
    `);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "category_id"
    `);
  }
}
