import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceVariantCustomFields1744200000045
  implements MigrationInterface
{
  name = "WorkspaceVariantCustomFields1744200000045";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "variant_custom_field_type_enum" AS ENUM ('text', 'options')
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_variant_custom_field" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "key" character varying(64) NOT NULL,
        "label" character varying(128) NOT NULL,
        "type" "variant_custom_field_type_enum" NOT NULL,
        "options" jsonb NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_variant_custom_field" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_variant_custom_field_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_workspace_variant_custom_field_workspace_key"
      ON "workspace_variant_custom_field" ("workspace_id", "key")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_variant_custom_field_workspace_id"
      ON "workspace_variant_custom_field" ("workspace_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "custom_attributes" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_variant_custom_field"
        ("workspace_id", "key", "label", "type", "options", "sort_order")
      SELECT w."id", 'color', 'Color', 'options',
        '["Black","White","Red","Blue","Green","Beige"]'::jsonb, 0
      FROM "workspace" w
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_variant_custom_field"
        ("workspace_id", "key", "label", "type", "options", "sort_order")
      SELECT w."id", 'size', 'Size', 'options',
        '["XS","S","M","L","XL","XXL"]'::jsonb, 1
      FROM "workspace" w
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "custom_attributes"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_variant_custom_field"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "variant_custom_field_type_enum"`);
  }
}
