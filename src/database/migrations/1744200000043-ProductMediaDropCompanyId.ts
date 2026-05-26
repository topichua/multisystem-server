import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductMediaDropCompanyId1744200000043
  implements MigrationInterface
{
  name = "ProductMediaDropCompanyId1744200000043";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_product_media_variant_match" ON "product_media"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS product_media_enforce_variant_product_match()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION product_media_enforce_variant_product_match()
      RETURNS trigger AS $$
      DECLARE
        v_pid integer;
      BEGIN
        IF NEW."variant_id" IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT "product_id" INTO v_pid
        FROM "product_variants"
        WHERE "id" = NEW."variant_id";
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Invalid variant_id';
        END IF;
        IF v_pid IS DISTINCT FROM NEW."product_id" THEN
          RAISE EXCEPTION 'variant must belong to the same product as the media row';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_product_tenant"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_company_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP COLUMN IF EXISTS "company_id"
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_product_media_product_id'
        ) THEN
          ALTER TABLE "product_media"
          ADD CONSTRAINT "FK_product_media_product_id"
          FOREIGN KEY ("product_id")
          REFERENCES "products" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_product_media_variant_match"
      BEFORE INSERT OR UPDATE OF "variant_id", "product_id" ON "product_media"
      FOR EACH ROW
      EXECUTE PROCEDURE product_media_enforce_variant_product_match()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_product_media_variant_match" ON "product_media"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS product_media_enforce_variant_product_match()
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT IF EXISTS "FK_product_media_product_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "company_id" integer
    `);

    await queryRunner.query(`
      UPDATE "product_media" pm
      SET "company_id" = i."id"
      FROM "products" p
      INNER JOIN "instagram_integration" i ON i."workspace_id" = p."workspace_id"
      WHERE pm."product_id" = p."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ALTER COLUMN "company_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_company_id"
      FOREIGN KEY ("company_id")
      REFERENCES "instagram_integration" ("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_product_tenant"
      FOREIGN KEY ("product_id", "company_id")
      REFERENCES "products" ("id", "company_id")
      ON DELETE CASCADE ON UPDATE NO ACTION
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
  }
}
