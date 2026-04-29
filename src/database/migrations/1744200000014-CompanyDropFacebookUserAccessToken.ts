import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Long-lived user token lives in `company.access_token`; page token stays in `sources.token`.
 */
export class CompanyDropFacebookUserAccessToken1744200000014
  implements MigrationInterface
{
  name = 'CompanyDropFacebookUserAccessToken1744200000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "company"
      SET "access_token" = "facebook_user_access_token"
      WHERE "facebook_user_access_token" IS NOT NULL
        AND TRIM("facebook_user_access_token") <> ''
    `);
    await queryRunner.query(`
      ALTER TABLE "company" DROP COLUMN IF EXISTS "facebook_user_access_token"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "facebook_user_access_token" text NULL
    `);
  }
}
