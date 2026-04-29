import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyDropBusinessAccountId1744200000015
  implements MigrationInterface
{
  name = 'CompanyDropBusinessAccountId1744200000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" DROP COLUMN IF EXISTS "business_account_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "business_account_id" text NULL
    `);
    await queryRunner.query(`
      UPDATE "company" SET "business_account_id" = "page_id"
    `);
  }
}
