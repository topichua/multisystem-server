import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Workspace work schedule (business hours) + timezone for deferred auto-messages.
 */
export class WorkspaceWorkSchedule1744200000186 implements MigrationInterface {
  name = "WorkspaceWorkSchedule1744200000186";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN IF NOT EXISTS "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Kyiv'
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN IF NOT EXISTS "work_schedule" jsonb
    `);

    await queryRunner.query(`
      UPDATE "workspace"
      SET "work_schedule" = '{
        "dayStart": "09:00",
        "dayEnd": "19:00",
        "workDays": ["mon", "tue", "wed", "thu", "fri"],
        "differentHoursPerDay": false,
        "dayHours": {}
      }'::jsonb
      WHERE "work_schedule" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace"
      ALTER COLUMN "work_schedule" SET DEFAULT '{
        "dayStart": "09:00",
        "dayEnd": "19:00",
        "workDays": ["mon", "tue", "wed", "thu", "fri"],
        "differentHoursPerDay": false,
        "dayHours": {}
      }'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace"
      ALTER COLUMN "work_schedule" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      DROP COLUMN IF EXISTS "work_schedule"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace"
      DROP COLUMN IF EXISTS "timezone"
    `);
  }
}
