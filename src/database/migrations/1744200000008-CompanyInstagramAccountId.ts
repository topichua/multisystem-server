import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyInstagramAccountId1744200000008
  implements MigrationInterface
{
  name = 'CompanyInstagramAccountId1744200000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company"
        ADD COLUMN IF NOT EXISTS "instagram_account_id" VARCHAR(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" DROP COLUMN IF EXISTS "instagram_account_id"
    `);
  }
}
