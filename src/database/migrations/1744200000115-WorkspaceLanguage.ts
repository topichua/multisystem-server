import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceLanguage1744200000115 implements MigrationInterface {
  name = "WorkspaceLanguage1744200000115";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "workspace_language_enum" AS ENUM (
        'ua',
        'en'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN "language" "workspace_language_enum" NOT NULL DEFAULT 'ua'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      DROP COLUMN IF EXISTS "language"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_language_enum"`);
  }
}
