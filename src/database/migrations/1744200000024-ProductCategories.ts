import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductCategories1744200000024 implements MigrationInterface {
  name = 'ProductCategories1744200000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_categories"`);
  }
}
