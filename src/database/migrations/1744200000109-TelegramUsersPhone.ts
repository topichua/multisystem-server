import type { MigrationInterface, QueryRunner } from "typeorm";

export class TelegramUsersPhone1744200000109 implements MigrationInterface {
  name = "TelegramUsersPhone1744200000109";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      ADD COLUMN "phone" character varying(64)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_users"
      DROP COLUMN "phone"
    `);
  }
}
