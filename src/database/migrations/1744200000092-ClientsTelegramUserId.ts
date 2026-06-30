import type { MigrationInterface, QueryRunner } from "typeorm";

export class ClientsTelegramUserId1744200000092 implements MigrationInterface {
  name = "ClientsTelegramUserId1744200000092";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN "telegram_user_id" character varying(32)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_clients_telegram_user_id"
      ON "clients" ("telegram_user_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_clients_workspace_telegram_user_id"
      ON "clients" ("workspace_id", "telegram_user_id")
      WHERE "telegram_user_id" IS NOT NULL
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
        CHECK (
          "instagram_user_id" IS NULL OR "telegram_user_id" IS NULL
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP CONSTRAINT "CHK_clients_single_social_link"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP CONSTRAINT "FK_clients_telegram_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_clients_workspace_telegram_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "IDX_clients_telegram_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN "telegram_user_id"
    `);
  }
}
