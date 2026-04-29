import { MigrationInterface, QueryRunner } from 'typeorm';

/** Facebook OAuth long-lived user token — use standard `access_token` column name. */
export class CompanyLongTokenRenameAccessToken1744200000017
  implements MigrationInterface
{
  name = 'CompanyLongTokenRenameAccessToken1744200000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" RENAME COLUMN "long_token" TO "access_token"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" RENAME COLUMN "access_token" TO "long_token"
    `);
  }
}
