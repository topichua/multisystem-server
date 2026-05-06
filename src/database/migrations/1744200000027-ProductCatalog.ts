import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductCatalog1744200000027 implements MigrationInterface {
  name = "ProductCatalog1744200000027";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "products_status_enum" AS ENUM ('draft', 'active', 'archived')
    `);
    await queryRunner.query(`
      CREATE TYPE "products_source_type_enum" AS ENUM (
        'manual',
        'instagram_post',
        'instagram_story'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "product_media_type_enum" AS ENUM ('image', 'video')
    `);
    await queryRunner.query(`
      CREATE TYPE "product_source_ref_type_enum" AS ENUM (
        'instagram_post',
        'instagram_story'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "name" character varying(512) NOT NULL,
        "description" text,
        "status" "products_status_enum" NOT NULL DEFAULT 'draft',
        "source_type" "products_source_type_enum",
        "source_id" character varying(255),
        "reference_group_id" character varying(255),
        "price" numeric(12, 2),
        "currency" character varying(8) NOT NULL DEFAULT 'UAH',
        "in_stock" boolean,
        "quantity" integer,
        "main_image_url" text,
        "created_by_user_id" integer NOT NULL,
        "updated_by_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_products_name_not_blank" CHECK (btrim("name") <> ''),
        CONSTRAINT "CHK_products_price_non_negative" CHECK (
          "price" IS NULL OR "price" >= 0
        ),
        CONSTRAINT "CHK_products_quantity_non_negative" CHECK (
          "quantity" IS NULL OR "quantity" >= 0
        ),
        CONSTRAINT "FK_products_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_products_created_by_user_id"
          FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_products_updated_by_user_id"
          FOREIGN KEY ("updated_by_user_id")
          REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_id_company_id"
      ON "products" ("id", "company_id")
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_products_company_id" ON "products" ("company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_company_id_status" ON "products" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_reference_group_id" ON "products" ("reference_group_id")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION products_enforce_draft_delete_only()
      RETURNS trigger AS $$
      BEGIN
        IF OLD.status IS DISTINCT FROM 'draft'::products_status_enum THEN
          RAISE EXCEPTION 'Only products with status draft can be deleted';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_products_enforce_draft_delete_only"
      BEFORE DELETE ON "products"
      FOR EACH ROW
      EXECUTE PROCEDURE products_enforce_draft_delete_only()
    `);

    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "color" character varying(128),
        "size" character varying(128),
        "price" numeric(12, 2),
        "in_stock" boolean,
        "quantity" integer,
        "image_url" text,
        "sku" character varying(128),
        "created_by_user_id" integer NOT NULL,
        "updated_by_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_variants" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_product_variants_price_non_negative" CHECK (
          "price" IS NULL OR "price" >= 0
        ),
        CONSTRAINT "CHK_product_variants_quantity_non_negative" CHECK (
          "quantity" IS NULL OR "quantity" >= 0
        ),
        CONSTRAINT "FK_product_variants_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_variants_product_tenant"
          FOREIGN KEY ("product_id", "company_id")
          REFERENCES "products"("id", "company_id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_variants_created_by_user_id"
          FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_variants_updated_by_user_id"
          FOREIGN KEY ("updated_by_user_id")
          REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_variants_product_id" ON "product_variants" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_variants_company_id" ON "product_variants" ("company_id")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION products_categories_enforce_workspace_match()
      RETURNS trigger AS $$
      DECLARE
        company_ws integer;
        category_ws integer;
      BEGIN
        SELECT "workspace_id" INTO company_ws
        FROM "integration"
        WHERE "id" = NEW.company_id;

        SELECT "workspace_id" INTO category_ws
        FROM "product_categories"
        WHERE "id" = NEW.category_id;

        IF company_ws IS NULL OR category_ws IS NULL OR company_ws <> category_ws THEN
          RAISE EXCEPTION 'Category must belong to the same workspace as the product company';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TABLE "products_categories" (
        "product_id" integer NOT NULL,
        "category_id" integer NOT NULL,
        "company_id" integer NOT NULL,
        "created_by_user_id" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products_categories" PRIMARY KEY ("product_id", "category_id"),
        CONSTRAINT "FK_products_categories_product_tenant"
          FOREIGN KEY ("product_id", "company_id")
          REFERENCES "products"("id", "company_id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_products_categories_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_products_categories_category_id"
          FOREIGN KEY ("category_id")
          REFERENCES "product_categories"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_products_categories_created_by_user_id"
          FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_products_categories_category_id" ON "products_categories" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_categories_company_id" ON "products_categories" ("company_id")`,
    );

    await queryRunner.query(`
      CREATE TRIGGER "TRG_products_categories_workspace_match"
      BEFORE INSERT OR UPDATE ON "products_categories"
      FOR EACH ROW
      EXECUTE PROCEDURE products_categories_enforce_workspace_match()
    `);

    await queryRunner.query(`
      CREATE TABLE "product_media" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "url" text NOT NULL,
        "type" "product_media_type_enum" NOT NULL,
        "source_url" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_by_user_id" integer NOT NULL,
        "updated_by_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_media" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_media_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_media_product_tenant"
          FOREIGN KEY ("product_id", "company_id")
          REFERENCES "products"("id", "company_id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_media_created_by_user_id"
          FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_media_updated_by_user_id"
          FOREIGN KEY ("updated_by_user_id")
          REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_media_product_id" ON "product_media" ("product_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_source_references" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "source_type" "product_source_ref_type_enum" NOT NULL,
        "source_id" character varying(255) NOT NULL,
        "permalink" text,
        "caption" text,
        "created_by_user_id" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_source_references" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_source_references_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_source_references_product_tenant"
          FOREIGN KEY ("product_id", "company_id")
          REFERENCES "products"("id", "company_id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_source_references_created_by_user_id"
          FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_source_references_product_id" ON "product_source_references" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_source_references_source_id" ON "product_source_references" ("source_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_source_references_source_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_source_references_product_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_source_references"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_media_product_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_media"`);

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

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_variants_company_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_variants_product_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_products_enforce_draft_delete_only" ON "products"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS products_enforce_draft_delete_only()
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_products_reference_group_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_products_company_id_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_company_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_id_company_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "product_source_ref_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "product_media_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "products_source_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "products_status_enum"`);
  }
}
