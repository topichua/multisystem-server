import { MigrationInterface, QueryRunner } from "typeorm";

export class DropProductDraftDeleteTrigger1744200000099
  implements MigrationInterface
{
  name = "DropProductDraftDeleteTrigger1744200000099";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_products_enforce_draft_delete_only" ON "products"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS products_enforce_draft_delete_only()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
