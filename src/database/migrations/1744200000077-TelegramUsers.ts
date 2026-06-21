import { MigrationInterface, QueryRunner } from "typeorm";

export class TelegramUsers1744200000077 implements MigrationInterface {
  name = "TelegramUsers1744200000077";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telegram_users" (
        "id" character varying(32) NOT NULL,
        "first_name" character varying(255) NOT NULL DEFAULT '',
        "last_name" character varying(255),
        "username" character varying(255),
        "profile_pic" text NOT NULL DEFAULT '',
        "synced_at" timestamptz,
        "last_seen" timestamptz,
        CONSTRAINT "PK_telegram_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_telegram_users_username" ON "telegram_users" ("username")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_telegram_users_username"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_users"`);
  }
}
