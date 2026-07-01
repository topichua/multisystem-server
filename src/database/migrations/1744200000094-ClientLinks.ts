import type { MigrationInterface, QueryRunner } from "typeorm";

export class ClientLinks1744200000094 implements MigrationInterface {
  name = "ClientLinks1744200000094";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "client_links_provider_enum" AS ENUM ('telegram', 'instagram')
    `);

    await queryRunner.query(`
      CREATE TABLE "client_links" (
        "id" SERIAL NOT NULL,
        "client_id" integer NOT NULL,
        "workspace_id" integer NOT NULL,
        "provider" "client_links_provider_enum" NOT NULL,
        "external_id" character varying(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_links" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_client_links_client_provider_external"
          UNIQUE ("client_id", "provider", "external_id"),
        CONSTRAINT "UQ_client_links_workspace_provider_external"
          UNIQUE ("workspace_id", "provider", "external_id"),
        CONSTRAINT "FK_client_links_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_client_links_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_client_links_client_id"
      ON "client_links" ("client_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_client_links_workspace_provider_external"
      ON "client_links" ("workspace_id", "provider", "external_id")
    `);

    await queryRunner.query(`
      INSERT INTO "client_links" ("client_id", "workspace_id", "provider", "external_id")
      SELECT c."id", c."workspace_id", 'instagram', c."instagram_user_id"
      FROM "clients" c
      WHERE c."instagram_user_id" IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "client_links" ("client_id", "workspace_id", "provider", "external_id")
      SELECT c."id", c."workspace_id", 'telegram', c."telegram_user_id"
      FROM "clients" c
      WHERE c."telegram_user_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "CHK_clients_single_social_link"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_telegram_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_instagram_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_clients_workspace_telegram_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_clients_workspace_instagram_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_clients_telegram_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_clients_instagram_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients" DROP COLUMN IF EXISTS "telegram_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients" DROP COLUMN IF EXISTS "instagram_user_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN "instagram_user_id" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN "telegram_user_id" character varying(32)
    `);

    await queryRunner.query(`
      UPDATE "clients" c
      SET "instagram_user_id" = sub."external_id"
      FROM (
        SELECT DISTINCT ON (cl."client_id")
          cl."client_id",
          cl."external_id"
        FROM "client_links" cl
        WHERE cl."provider" = 'instagram'
        ORDER BY cl."client_id", cl."id" ASC
      ) sub
      WHERE c."id" = sub."client_id"
    `);

    await queryRunner.query(`
      UPDATE "clients" c
      SET "telegram_user_id" = sub."external_id"
      FROM (
        SELECT DISTINCT ON (cl."client_id")
          cl."client_id",
          cl."external_id"
        FROM "client_links" cl
        WHERE cl."provider" = 'telegram'
        ORDER BY cl."client_id", cl."id" ASC
      ) sub
      WHERE c."id" = sub."client_id"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_clients_instagram_user_id"
      ON "clients" ("instagram_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_clients_telegram_user_id"
      ON "clients" ("telegram_user_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_clients_workspace_instagram_user_id"
      ON "clients" ("workspace_id", "instagram_user_id")
      WHERE "instagram_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_clients_workspace_telegram_user_id"
      ON "clients" ("workspace_id", "telegram_user_id")
      WHERE "telegram_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "FK_clients_instagram_user_id"
        FOREIGN KEY ("instagram_user_id") REFERENCES "instagram_users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "FK_clients_telegram_user_id"
        FOREIGN KEY ("telegram_user_id") REFERENCES "telegram_users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "CHK_clients_single_social_link"
        CHECK ("instagram_user_id" IS NULL OR "telegram_user_id" IS NULL)
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "client_links"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "client_links_provider_enum"`);
  }
}
