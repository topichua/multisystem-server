import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyAccessTokenRenameLongToken1744200000016
  implements MigrationInterface
{
  name = 'CompanyAccessTokenRenameLongToken1744200000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" RENAME COLUMN "access_token" TO "long_token"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" RENAME COLUMN "long_token" TO "access_token"
    `);
  }
}
