import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductPermissionsAndReferenceGrants1744200000154 implements MigrationInterface {
  name = "ProductPermissionsAndReferenceGrants1744200000154";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_role_product_reference_grants" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "role_id" integer NOT NULL,
        "integration_type" character varying(32) NOT NULL,
        "integration_id" integer NOT NULL,
        "can_manage" boolean NOT NULL DEFAULT true,
        "granted_by_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_role_product_reference_grants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspace_role_product_reference_grants"
          UNIQUE ("role_id", "integration_type", "integration_id"),
        CONSTRAINT "FK_workspace_role_product_reference_grants_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_role_product_reference_grants_role_id"
          FOREIGN KEY ("role_id") REFERENCES "workspace_roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_role_product_reference_grants_granted_by_user_id"
          FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_role_product_reference_grants_role_id"
      ON "workspace_role_product_reference_grants" ("role_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_role_product_reference_grants_workspace_id"
      ON "workspace_role_product_reference_grants" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_role_product_reference_grants_integration"
      ON "workspace_role_product_reference_grants" ("integration_type", "integration_id")
    `);

    await queryRunner.query(`
      UPDATE "workspace_roles" AS wr
      SET "permissions" = (
        SELECT jsonb_agg(DISTINCT value ORDER BY value)
        FROM jsonb_array_elements_text(
          COALESCE(wr."permissions", '[]'::jsonb) || '["products.enabled"]'::jsonb
        ) AS value
      )
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(wr."permissions", '[]'::jsonb)) AS p(value)
        WHERE p.value LIKE 'products.%'
          AND p.value <> 'products.enabled'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(wr."permissions", '[]'::jsonb)) AS p(value)
        WHERE p.value = 'products.enabled'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "workspace_role_product_reference_grants"`,
    );
  }
}
