import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyBusinessAccountIdRename1744200000009
  implements MigrationInterface
{
  name = 'CompanyBusinessAccountIdRename1744200000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'company' AND column_name = 'page_token'
        ) THEN
          ALTER TABLE "company"
            RENAME COLUMN "page_token" TO "business_account_id";
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'company' AND column_name = 'business_account_id'
        ) THEN
          ALTER TABLE "company"
            RENAME COLUMN "business_account_id" TO "page_token";
        END IF;
      END
      $$;
    `);
  }
}
