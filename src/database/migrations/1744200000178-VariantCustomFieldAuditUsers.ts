import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantCustomFieldAuditUsers1744200000178
  implements MigrationInterface
{
  name = "VariantCustomFieldAuditUsers1744200000178";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        ADD COLUMN IF NOT EXISTS "created_by_user_id" integer,
        ADD COLUMN IF NOT EXISTS "updated_by_user_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        DROP CONSTRAINT IF EXISTS "FK_workspace_variant_custom_field_created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        DROP CONSTRAINT IF EXISTS "FK_workspace_variant_custom_field_updated_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        ADD CONSTRAINT "FK_workspace_variant_custom_field_created_by_user_id"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        ADD CONSTRAINT "FK_workspace_variant_custom_field_updated_by_user_id"
          FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_variant_custom_field_created_by_user_id"
        ON "workspace_variant_custom_field" ("created_by_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_variant_custom_field_updated_by_user_id"
        ON "workspace_variant_custom_field" ("updated_by_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_workspace_variant_custom_field_updated_by_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_workspace_variant_custom_field_created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        DROP CONSTRAINT IF EXISTS "FK_workspace_variant_custom_field_updated_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        DROP CONSTRAINT IF EXISTS "FK_workspace_variant_custom_field_created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_variant_custom_field"
        DROP COLUMN IF EXISTS "updated_by_user_id",
        DROP COLUMN IF EXISTS "created_by_user_id"
    `);
  }
}
