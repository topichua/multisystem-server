import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `instagram_users.id` (serial) -> PK is `scoped_id` (Graph PSID/IGSID).
 * `clients.instagram_user_id` (int) -> `instagram_user_scoped_id` (varchar FK).
 */
export class InstagramUserScopedIdPK1744200000005 implements MigrationInterface {
  name = 'InstagramUserScopedIdPK1744200000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_instagram_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_clients_instagram_user_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "clients"
        ADD COLUMN "instagram_user_scoped_id" character varying(255) NULL
    `);
    await queryRunner.query(`
      UPDATE "clients" AS c
      SET "instagram_user_scoped_id" = i."scoped_id"
      FROM "instagram_users" AS i
      WHERE c."instagram_user_id" = i."id"
    `);

    const unmapped: { c: string }[] = await queryRunner.query(`
      SELECT COUNT(*)::text AS c FROM "clients" WHERE "instagram_user_scoped_id" IS NULL
    `);
    if (unmapped[0] && unmapped[0].c !== '0') {
      throw new Error(
        'Migration InstagramUserScopedIdPK: some clients could not be mapped to instagram_users.scoped_id (null scoped_id on parent). Fix data and retry.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "instagram_user_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "clients" ALTER COLUMN "instagram_user_scoped_id" SET NOT NULL
    `);

    await queryRunner.query(
      `DELETE FROM "instagram_users" WHERE "scoped_id" IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_instagram_users_scoped_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_users" DROP CONSTRAINT "PK_instagram_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_users" DROP COLUMN "id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "instagram_users" ALTER COLUMN "scoped_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_users" ADD CONSTRAINT "PK_instagram_users" PRIMARY KEY ("scoped_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_instagram_user_scoped_id"
        FOREIGN KEY ("instagram_user_scoped_id")
        REFERENCES "instagram_users"("scoped_id")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_clients_instagram_user_scoped_id" ON "clients" ("instagram_user_scoped_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_instagram_user_scoped_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_clients_instagram_user_scoped_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_users" DROP CONSTRAINT "PK_instagram_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_users" ADD COLUMN "id" serial NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_users" ADD CONSTRAINT "PK_instagram_users" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_instagram_users_scoped_id" ON "instagram_users" ("scoped_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients" ADD COLUMN "instagram_user_id" integer NULL`,
    );
    await queryRunner.query(`
      UPDATE "clients" AS c
      SET "instagram_user_id" = i."id"
      FROM "instagram_users" AS i
      WHERE c."instagram_user_scoped_id" = i."scoped_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "instagram_user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "instagram_user_scoped_id"`,
    );

    await queryRunner.query(`
      ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_instagram_user_id"
        FOREIGN KEY ("instagram_user_id")
        REFERENCES "instagram_users"("id")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_clients_instagram_user_id" ON "clients" ("instagram_user_id")
    `);
  }
}
