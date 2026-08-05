import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatAutoDistribution1744200000174 implements MigrationInterface {
  name = "ChatAutoDistribution1744200000174";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_integration"
      ADD COLUMN IF NOT EXISTS "chat_auto_distribution" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_integrations"
      ADD COLUMN IF NOT EXISTS "chat_auto_distribution" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_integration"
      DROP COLUMN IF EXISTS "chat_auto_distribution"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_integrations"
      DROP COLUMN IF EXISTS "chat_auto_distribution"
    `);
  }
}
