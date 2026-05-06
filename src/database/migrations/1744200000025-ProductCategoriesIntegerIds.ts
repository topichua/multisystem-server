import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces UUID ids with SERIAL integer ids (and integer `parent_id`).
 * Safe for empty `product_categories`; drops and recreates the table.
 */
export class ProductCategoriesIntegerIds1744200000025 implements MigrationInterface {
  name = 'ProductCategoriesIntegerIds1744200000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_categories" CASCADE`);
    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "name" character varying(80) NOT NULL,
        "parent_id" integer,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "FK_product_categories_workspace_id"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "FK_product_categories_parent_id"
      FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_workspace_id" ON "product_categories" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_parent_id" ON "product_categories" ("parent_id")`,
    );
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_categories" CASCADE`);
    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" integer NOT NULL,
        "name" character varying(80) NOT NULL,
        "parent_id" uuid,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "FK_product_categories_workspace_id"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "FK_product_categories_parent_id"
      FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_workspace_id" ON "product_categories" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_parent_id" ON "product_categories" ("parent_id")`,
    );
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
