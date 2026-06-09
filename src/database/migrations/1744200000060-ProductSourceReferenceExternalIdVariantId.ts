import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductSourceReferenceExternalIdVariantId1744200000060 implements MigrationInterface {
  name = "ProductSourceReferenceExternalIdVariantId1744200000060";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      ADD COLUMN "external_id" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      ADD COLUMN "product_variant_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      ADD CONSTRAINT "FK_product_source_references_product_variant_id"
      FOREIGN KEY ("product_variant_id")
      REFERENCES "product_variants"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_source_references_external_id" ON "product_source_references" ("external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_source_references_product_variant_id" ON "product_source_references" ("product_variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_source_references_product_variant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_source_references_external_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      DROP CONSTRAINT IF EXISTS "FK_product_source_references_product_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      DROP COLUMN IF EXISTS "product_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_source_references"
      DROP COLUMN IF EXISTS "external_id"
    `);
  }
}
