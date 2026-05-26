import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductMoveToWorkspaceId1744200000042
  implements MigrationInterface
{
  name = "ProductMoveToWorkspaceId1744200000042";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_products_category_workspace" ON "products"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "workspace_id" integer
    `);

    await queryRunner.query(`
      UPDATE "products" p
      SET "workspace_id" = i."workspace_id"
      FROM "instagram_integration" i
      WHERE p."company_id" = i."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_product_tenant"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      DROP CONSTRAINT IF EXISTS "FK_product_source_references_product_tenant"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP CONSTRAINT IF EXISTS "FK_products_company_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_products_company_id_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_products_company_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_products_id_company_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "company_id"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_workspace_id" ON "products" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_products_workspace_id_status"
      ON "products" ("workspace_id", "status")
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_workspace_id"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspace" ("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      ADD CONSTRAINT "FK_product_source_references_product_id"
      FOREIGN KEY ("product_id")
      REFERENCES "products" ("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_product_id"
      FOREIGN KEY ("product_id")
      REFERENCES "products" ("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION products_enforce_category_workspace_match()
      RETURNS trigger AS $$
      DECLARE
        category_ws integer;
      BEGIN
        IF NEW."category_id" IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT "workspace_id" INTO category_ws
        FROM "product_categories"
        WHERE "id" = NEW."category_id";
        IF category_ws IS NULL OR category_ws <> NEW."workspace_id" THEN
          RAISE EXCEPTION 'Category must belong to the same workspace as the product';
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_products_category_workspace" ON "products"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_product_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      DROP CONSTRAINT IF EXISTS "FK_product_source_references_product_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP CONSTRAINT IF EXISTS "FK_products_workspace_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_products_workspace_id_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_products_workspace_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "company_id" integer
    `);

    await queryRunner.query(`
      UPDATE "products" p
      SET "company_id" = i."id"
      FROM "instagram_integration" i
      WHERE i."workspace_id" = p."workspace_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "company_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_company_id"
      FOREIGN KEY ("company_id")
      REFERENCES "instagram_integration" ("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_company_id" ON "products" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_products_company_id_status"
      ON "products" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_id_company_id"
      ON "products" ("id", "company_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      ADD CONSTRAINT "FK_product_source_references_product_tenant"
      FOREIGN KEY ("product_id", "company_id")
      REFERENCES "products" ("id", "company_id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_product_tenant"
      FOREIGN KEY ("product_id", "company_id")
      REFERENCES "products" ("id", "company_id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "workspace_id"
    `);

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
        FROM "instagram_integration"
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
  }
}
