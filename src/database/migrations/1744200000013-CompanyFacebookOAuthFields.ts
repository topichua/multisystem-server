import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyFacebookOAuthFields1744200000013
  implements MigrationInterface
{
  name = 'CompanyFacebookOAuthFields1744200000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "facebook_page_name" character varying(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "facebook_user_access_token" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "token_connected_at" timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "token_status" character varying(32) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN IF EXISTS "token_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN IF EXISTS "token_connected_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN IF EXISTS "facebook_user_access_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN IF EXISTS "facebook_page_name"`,
    );
  }
}
