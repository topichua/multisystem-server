import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Scope `instagram_users` and `telegram_users` per workspace so the same
 * platform user id can have different display names across workspaces.
 */
export class SocialUsersWorkspaceId1744200000107 implements MigrationInterface {
  name = "SocialUsersWorkspaceId1744200000107";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.migrateInstagramUsers(queryRunner);
    await this.migrateTelegramUsers(queryRunner);
  }

  private async migrateInstagramUsers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      ADD COLUMN "workspace_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      DROP CONSTRAINT "PK_instagram_users"
    `);

    await queryRunner.query(`
      UPDATE "instagram_users" AS u
      SET "workspace_id" = chosen."workspace_id"
      FROM (
        SELECT DISTINCT ON (pairs."user_id")
          pairs."user_id",
          pairs."workspace_id"
        FROM (
          SELECT c."participant_id" AS "user_id", c."workspace_id"
          FROM "conversations" c
          WHERE c."source" = 1
            AND c."participant_id" IS NOT NULL
            AND c."participant_id" <> 'unknown'
          UNION
          SELECT cl."external_id" AS "user_id", cl."workspace_id"
          FROM "client_links" cl
          WHERE cl."provider" = 'instagram'
        ) pairs
        ORDER BY pairs."user_id", pairs."workspace_id"
      ) chosen
      WHERE u."id" = chosen."user_id"
    `);

    await queryRunner.query(`
      INSERT INTO "instagram_users" (
        "workspace_id",
        "id",
        "name",
        "username",
        "profile_pic",
        "synced_at",
        "last_seen"
      )
      SELECT
        pairs."workspace_id",
        pairs."user_id",
        src."name",
        src."username",
        src."profile_pic",
        src."synced_at",
        src."last_seen"
      FROM (
        SELECT DISTINCT c."workspace_id", c."participant_id" AS "user_id"
        FROM "conversations" c
        WHERE c."source" = 1
          AND c."participant_id" IS NOT NULL
          AND c."participant_id" <> 'unknown'
        UNION
        SELECT DISTINCT cl."workspace_id", cl."external_id" AS "user_id"
        FROM "client_links" cl
        WHERE cl."provider" = 'instagram'
      ) pairs
      INNER JOIN (
        SELECT DISTINCT ON ("id")
          "id",
          "name",
          "username",
          "profile_pic",
          "synced_at",
          "last_seen"
        FROM "instagram_users"
        ORDER BY "id", "workspace_id" NULLS LAST
      ) src ON src."id" = pairs."user_id"
      WHERE NOT EXISTS (
        SELECT 1
        FROM "instagram_users" existing
        WHERE existing."workspace_id" = pairs."workspace_id"
          AND existing."id" = pairs."user_id"
      )
    `);

    await queryRunner.query(`
      DELETE FROM "instagram_users"
      WHERE "workspace_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      ADD CONSTRAINT "PK_instagram_users"
      PRIMARY KEY ("workspace_id", "id")
    `);

    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      ADD CONSTRAINT "FK_instagram_users_workspace_id"
        FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_instagram_users_username"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_instagram_users_workspace_username"
      ON "instagram_users" ("workspace_id", "username")
    `);
  }

  private async migrateTelegramUsers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      ADD COLUMN "workspace_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      DROP CONSTRAINT "PK_telegram_users"
    `);

    await queryRunner.query(`
      UPDATE "telegram_users" AS u
      SET "workspace_id" = chosen."workspace_id"
      FROM (
        SELECT DISTINCT ON (pairs."user_id")
          pairs."user_id",
          pairs."workspace_id"
        FROM (
          SELECT c."participant_id" AS "user_id", c."workspace_id"
          FROM "conversations" c
          WHERE c."source" = 2
            AND c."participant_id" IS NOT NULL
            AND c."participant_id" <> 'unknown'
          UNION
          SELECT cl."external_id" AS "user_id", cl."workspace_id"
          FROM "client_links" cl
          WHERE cl."provider" = 'telegram'
        ) pairs
        ORDER BY pairs."user_id", pairs."workspace_id"
      ) chosen
      WHERE u."id" = chosen."user_id"
    `);

    await queryRunner.query(`
      INSERT INTO "telegram_users" (
        "workspace_id",
        "id",
        "first_name",
        "last_name",
        "username",
        "profile_pic",
        "synced_at",
        "last_seen"
      )
      SELECT
        pairs."workspace_id",
        pairs."user_id",
        src."first_name",
        src."last_name",
        src."username",
        src."profile_pic",
        src."synced_at",
        src."last_seen"
      FROM (
        SELECT DISTINCT c."workspace_id", c."participant_id" AS "user_id"
        FROM "conversations" c
        WHERE c."source" = 2
          AND c."participant_id" IS NOT NULL
          AND c."participant_id" <> 'unknown'
        UNION
        SELECT DISTINCT cl."workspace_id", cl."external_id" AS "user_id"
        FROM "client_links" cl
        WHERE cl."provider" = 'telegram'
      ) pairs
      INNER JOIN (
        SELECT DISTINCT ON ("id")
          "id",
          "first_name",
          "last_name",
          "username",
          "profile_pic",
          "synced_at",
          "last_seen"
        FROM "telegram_users"
        ORDER BY "id", "workspace_id" NULLS LAST
      ) src ON src."id" = pairs."user_id"
      WHERE NOT EXISTS (
        SELECT 1
        FROM "telegram_users" existing
        WHERE existing."workspace_id" = pairs."workspace_id"
          AND existing."id" = pairs."user_id"
      )
    `);

    await queryRunner.query(`
      DELETE FROM "telegram_users"
      WHERE "workspace_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      ADD CONSTRAINT "PK_telegram_users"
      PRIMARY KEY ("workspace_id", "id")
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      ADD CONSTRAINT "FK_telegram_users_workspace_id"
        FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_telegram_users_username"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_telegram_users_workspace_username"
      ON "telegram_users" ("workspace_id", "username")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      DROP CONSTRAINT IF EXISTS "FK_telegram_users_workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      DROP CONSTRAINT "PK_telegram_users"
    `);
    await queryRunner.query(`
      DELETE FROM "telegram_users" u
      USING "telegram_users" keep
      WHERE u."id" = keep."id"
        AND u."workspace_id" > keep."workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      DROP COLUMN "workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      ADD CONSTRAINT "PK_telegram_users" PRIMARY KEY ("id")
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_telegram_users_workspace_username"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_telegram_users_username"
      ON "telegram_users" ("username")
    `);

    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      DROP CONSTRAINT IF EXISTS "FK_instagram_users_workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      DROP CONSTRAINT "PK_instagram_users"
    `);
    await queryRunner.query(`
      DELETE FROM "instagram_users" u
      USING "instagram_users" keep
      WHERE u."id" = keep."id"
        AND u."workspace_id" > keep."workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      DROP COLUMN "workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "instagram_users"
      ADD CONSTRAINT "PK_instagram_users" PRIMARY KEY ("id")
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_instagram_users_workspace_username"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_instagram_users_username"
      ON "instagram_users" ("username")
    `);
  }
}
