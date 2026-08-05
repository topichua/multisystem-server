import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductExports1744200000176 implements MigrationInterface {
  name = "ProductExports1744200000176";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_exports" (
        "id" character varying(64) NOT NULL,
        "workspace_id" integer NOT NULL,
        "requested_by_id" integer NOT NULL,
        "scope" character varying(16) NOT NULL,
        "format" character varying(8) NOT NULL,
        "filters" jsonb,
        "sort" jsonb,
        "product_ids" jsonb,
        "status" character varying(16) NOT NULL,
        "file_key" text,
        "file_name" character varying(512),
        "file_size" bigint,
        "error_message" text,
        "include_purchase_price" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ,
        CONSTRAINT "PK_product_exports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_exports_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_exports_requested_by_id"
          FOREIGN KEY ("requested_by_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_exports_workspace_id"
      ON "product_exports" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_exports_workspace_status"
      ON "product_exports" ("workspace_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_exports_status_created"
      ON "product_exports" ("status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_exports_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_exports_workspace_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_exports_workspace_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_exports"`);
  }
}
