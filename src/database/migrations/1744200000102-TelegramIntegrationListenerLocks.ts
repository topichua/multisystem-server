import { MigrationInterface, QueryRunner } from "typeorm";

export class TelegramIntegrationListenerLocks1744200000102 implements MigrationInterface {
  name = "TelegramIntegrationListenerLocks1744200000102";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_integrations"
      ADD COLUMN "listener_instance_id" varchar(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_integrations"
      ADD COLUMN "listener_heartbeat_at" timestamptz
    `);

    await queryRunner.query(`
      CREATE TABLE "telegram_integration_locks" (
        "integration_id" integer NOT NULL,
        "locked_by_instance_id" varchar(255) NOT NULL,
        "lock_version" integer NOT NULL DEFAULT 1,
        "locked_at" timestamptz NOT NULL,
        "heartbeat_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telegram_integration_locks" PRIMARY KEY ("integration_id"),
        CONSTRAINT "FK_telegram_integration_locks_integration_id"
          FOREIGN KEY ("integration_id")
          REFERENCES "telegram_integrations" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_telegram_integration_locks_expires_at"
      ON "telegram_integration_locks" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_telegram_integration_locks_locked_by_instance_id"
      ON "telegram_integration_locks" ("locked_by_instance_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_telegram_integration_locks_locked_by_instance_id"
    `);
    await queryRunner.query(`
      DROP INDEX "IDX_telegram_integration_locks_expires_at"
    `);
    await queryRunner.query(`
      DROP TABLE "telegram_integration_locks"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_integrations"
      DROP COLUMN "listener_heartbeat_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_integrations"
      DROP COLUMN "listener_instance_id"
    `);
  }
}
