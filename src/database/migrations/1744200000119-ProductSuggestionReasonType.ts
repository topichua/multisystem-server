import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductSuggestionReasonType1744200000119
  implements MigrationInterface
{
  name = "ProductSuggestionReasonType1744200000119";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "product_suggestions_reason_type_enum" AS ENUM (
        'post_reference',
        'reels_refference',
        'text_recognition'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "product_suggestions"
      ADD COLUMN "reason_type" "product_suggestions_reason_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_suggestions"
      DROP COLUMN IF EXISTS "reason_type"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "product_suggestions_reason_type_enum"`,
    );
  }
}
