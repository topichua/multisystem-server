import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductInstagramReferences1744200000061 implements MigrationInterface {
  name = "ProductInstagramReferences1744200000061";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_instagram_references" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "instagram_integration_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "product_variant_id" integer,
        "permalink" text,
        "post_id" character varying(255) NOT NULL,
        "created_by_id" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_instagram_references" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_instagram_references_workspace_id"
          FOREIGN KEY ("workspace_id")
          REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_instagram_references_instagram_integration_id"
          FOREIGN KEY ("instagram_integration_id")
          REFERENCES "instagram_integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_instagram_references_product_id"
          FOREIGN KEY ("product_id")
          REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_instagram_references_product_variant_id"
          FOREIGN KEY ("product_variant_id")
          REFERENCES "product_variants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_instagram_references_created_by_id"
          FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_instagram_references_workspace_id" ON "product_instagram_references" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_instagram_references_product_id" ON "product_instagram_references" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_instagram_references_post_id" ON "product_instagram_references" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_instagram_references_product_variant_id" ON "product_instagram_references" ("product_variant_id")`,
    );

    const hasLegacy = await queryRunner.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'product_source_references'
      LIMIT 1
    `);
    if (hasLegacy.length > 0) {
      const legacyColumns: Array<{ column_name: string }> =
        await queryRunner.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'product_source_references'
        `);
      const legacyColumnNames = new Set(
        legacyColumns.map((row) => row.column_name),
      );
      const postIdExpr = legacyColumnNames.has("external_id")
        ? `COALESCE(NULLIF(TRIM(r."external_id"), ''), TRIM(r."source_id"))`
        : `TRIM(r."source_id")`;
      const variantIdExpr = legacyColumnNames.has("product_variant_id")
        ? `r."product_variant_id"`
        : `NULL`;

      await queryRunner.query(`
        INSERT INTO "product_instagram_references" (
          "workspace_id",
          "instagram_integration_id",
          "product_id",
          "product_variant_id",
          "permalink",
          "post_id",
          "created_by_id",
          "created_at"
        )
        SELECT
          p."workspace_id",
          r."company_id",
          r."product_id",
          ${variantIdExpr},
          r."permalink",
          ${postIdExpr},
          r."created_by_user_id",
          r."created_at"
        FROM "product_source_references" r
        INNER JOIN "products" p ON p."id" = r."product_id"
      `);

      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_product_source_references_product_variant_id"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_product_source_references_external_id"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_product_source_references_source_id"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_product_source_references_product_id"`,
      );
      await queryRunner.query(`DROP TABLE "product_source_references"`);
      await queryRunner.query(
        `DROP TYPE IF EXISTS "product_source_ref_type_enum"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "product_source_ref_type_enum" AS ENUM (
        'instagram_post',
        'instagram_story'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "product_source_references" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "source_type" "product_source_ref_type_enum" NOT NULL,
        "source_id" character varying(255) NOT NULL,
        "external_id" character varying(255),
        "product_variant_id" integer,
        "permalink" text,
        "caption" text,
        "created_by_user_id" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_source_references" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_source_references_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "instagram_integration"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_source_references_product_id"
          FOREIGN KEY ("product_id")
          REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_source_references_product_variant_id"
          FOREIGN KEY ("product_variant_id")
          REFERENCES "product_variants"("id")
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

    await queryRunner.query(`
      INSERT INTO "product_source_references" (
        "company_id",
        "product_id",
        "source_type",
        "source_id",
        "external_id",
        "product_variant_id",
        "permalink",
        "created_by_user_id",
        "created_at"
      )
      SELECT
        r."instagram_integration_id",
        r."product_id",
        'instagram_post',
        r."post_id",
        r."post_id",
        r."product_variant_id",
        r."permalink",
        r."created_by_id",
        r."created_at"
      FROM "product_instagram_references" r
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_instagram_references_product_variant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_instagram_references_post_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_instagram_references_product_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_instagram_references_workspace_id"`,
    );
    await queryRunner.query(`DROP TABLE "product_instagram_references"`);
  }
}
