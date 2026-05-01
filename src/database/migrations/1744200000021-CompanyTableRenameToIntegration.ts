import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the `company` table to `integration`. PostgreSQL updates FK targets
 * on `conversation_groups.company_id` automatically.
 */
export class CompanyTableRenameToIntegration1744200000021
  implements MigrationInterface
{
  name = 'CompanyTableRenameToIntegration1744200000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" RENAME TO "integration"`);
    await queryRunner.query(
      `ALTER INDEX "IDX_company_owner_id" RENAME TO "IDX_integration_owner_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration" RENAME CONSTRAINT "PK_company" TO "PK_integration"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration" RENAME CONSTRAINT "FK_company_owner_id_users_id" TO "FK_integration_owner_id_users_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration" RENAME CONSTRAINT "FK_integration_owner_id_users_id" TO "FK_company_owner_id_users_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration" RENAME CONSTRAINT "PK_integration" TO "PK_company"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_integration_owner_id" RENAME TO "IDX_company_owner_id"`,
    );
    await queryRunner.query(`ALTER TABLE "integration" RENAME TO "company"`);
  }
}
