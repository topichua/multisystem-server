import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Split Facebook tokens on `company`:
 * - `user_access_token` — long-lived **user** token (OAuth exchange).
 * - `access_token` — **Page** token from `me/accounts` (Graph `access_token` on the Page object).
 */
export class CompanyUserAccessTokenSplit1744200000018
  implements MigrationInterface
{
  name = 'CompanyUserAccessTokenSplit1744200000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "user_access_token" text NULL
    `);
    await queryRunner.query(`
      UPDATE "company"
      SET "user_access_token" = "access_token"
      WHERE "user_access_token" IS NULL
        AND "access_token" IS NOT NULL
        AND TRIM("access_token") <> ''
    `);
    await queryRunner.query(`
      ALTER TABLE "company" ALTER COLUMN "access_token" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "company"
      SET "access_token" = COALESCE(NULLIF(TRIM("access_token"), ''), "user_access_token")
      WHERE "access_token" IS NULL OR TRIM("access_token") = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "company" ALTER COLUMN "access_token" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "company" DROP COLUMN IF EXISTS "user_access_token"
    `);
  }
}
