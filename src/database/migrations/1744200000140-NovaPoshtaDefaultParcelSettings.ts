import { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaDefaultParcelSettings1744200000140
  implements MigrationInterface
{
  name = "NovaPoshtaDefaultParcelSettings1744200000140";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD COLUMN "default_weight_kg" numeric(8, 3),
      ADD COLUMN "default_width_cm" numeric(8, 2),
      ADD COLUMN "default_height_cm" numeric(8, 2),
      ADD COLUMN "default_length_cm" numeric(8, 2),
      ADD COLUMN "payment_purpose" character varying(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP COLUMN IF EXISTS "payment_purpose",
      DROP COLUMN IF EXISTS "default_length_cm",
      DROP COLUMN IF EXISTS "default_height_cm",
      DROP COLUMN IF EXISTS "default_width_cm",
      DROP COLUMN IF EXISTS "default_weight_kg"
    `);
  }
}
