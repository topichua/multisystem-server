import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductMediaVariantId1744200000029 implements MigrationInterface {
  name = "ProductMediaVariantId1744200000029";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "variant_id" integer
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION product_media_enforce_variant_product_match()
      RETURNS trigger AS $$
      DECLARE
        v_pid integer;
        v_cid integer;
      BEGIN
        IF NEW."variant_id" IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT "product_id", "company_id" INTO v_pid, v_cid
        FROM "product_variants"
        WHERE "id" = NEW."variant_id";
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Invalid variant_id';
        END IF;
        IF v_pid IS DISTINCT FROM NEW."product_id" OR v_cid IS DISTINCT FROM NEW."company_id" THEN
          RAISE EXCEPTION 'variant must belong to the same product and company as the media row';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_product_media_variant_match"
      BEFORE INSERT OR UPDATE OF "variant_id", "product_id", "company_id" ON "product_media"
      FOR EACH ROW
      EXECUTE PROCEDURE product_media_enforce_variant_product_match()
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_variant_id"
      FOREIGN KEY ("variant_id")
      REFERENCES "product_variants"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_media_variant_id" ON "product_media" ("variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_media_variant_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_variant_id"
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_product_media_variant_match" ON "product_media"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS product_media_enforce_variant_product_match()
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "variant_id"
    `);
  }
}
