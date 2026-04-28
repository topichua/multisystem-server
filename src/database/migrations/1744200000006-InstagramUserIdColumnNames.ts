import { MigrationInterface, QueryRunner } from 'typeorm';

/** `scoped_id` / `instagram_user_scoped_id` -> `id` / `instagram_user_id` (same string PK / FK). */
export class InstagramUserIdColumnNames1744200000006
  implements MigrationInterface
{
  name = 'InstagramUserIdColumnNames1744200000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_instagram_user_scoped_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_clients_instagram_user_scoped_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_users" RENAME COLUMN "scoped_id" TO "id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "clients" RENAME COLUMN "instagram_user_scoped_id" TO "instagram_user_id"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_clients_instagram_user_id" ON "clients" ("instagram_user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_instagram_user_id"
        FOREIGN KEY ("instagram_user_id")
        REFERENCES "instagram_users"("id")
        ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_instagram_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_clients_instagram_user_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "clients" RENAME COLUMN "instagram_user_id" TO "instagram_user_scoped_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "instagram_users" RENAME COLUMN "id" TO "scoped_id"`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_clients_instagram_user_scoped_id" ON "clients" ("instagram_user_scoped_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_instagram_user_scoped_id"
        FOREIGN KEY ("instagram_user_scoped_id")
        REFERENCES "instagram_users"("scoped_id")
        ON DELETE RESTRICT
    `);
  }
}
