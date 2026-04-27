import { MigrationInterface, QueryRunner } from 'typeorm';

export class InstagramUserScopedId1744200000004 implements MigrationInterface {
  name = 'InstagramUserScopedId1744200000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_users"
        ADD COLUMN IF NOT EXISTS "scoped_id" character varying(255) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instagram_users_scoped_id"
        ON "instagram_users" ("scoped_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_instagram_users_scoped_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_users" DROP COLUMN IF EXISTS "scoped_id"
    `);
  }
}
