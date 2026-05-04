import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allows CRM clients without a linked `instagram_users` row (`instagram_user_id` NULL).
 * Adds a partial unique index so at most one client per workspace can use a given Instagram id.
 */
export class ClientsInstagramUserIdNullable1744200000023 implements MigrationInterface {
  name = 'ClientsInstagramUserIdNullable1744200000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_instagram_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "instagram_user_id" DROP NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "FK_clients_instagram_user_id"
      FOREIGN KEY ("instagram_user_id") REFERENCES "instagram_users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_clients_workspace_instagram_user_id"
      ON "clients" ("workspace_id", "instagram_user_id")
      WHERE "instagram_user_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ c: string }> = await queryRunner.query(
      `SELECT COUNT(*)::text AS c FROM "clients" WHERE "instagram_user_id" IS NULL`,
    );
    if (Number(rows[0].c) > 0) {
      throw new Error(
        'Cannot revert ClientsInstagramUserIdNullable: remove or set instagram_user_id on rows where it is NULL, then retry.',
      );
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_clients_workspace_instagram_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT "FK_clients_instagram_user_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "clients" ALTER COLUMN "instagram_user_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "FK_clients_instagram_user_id"
      FOREIGN KEY ("instagram_user_id") REFERENCES "instagram_users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }
}
